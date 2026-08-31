"""Tests for click-to-configure inference and the file-name fallback.

The wizard used to ask people to choose a "wafer id source" from five options
and then write a regex. These tests pin the replacement: a click yields
concrete readings, each carrying the value it would actually produce.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.routers.format_wizard import _diff  # noqa: E402
from app.services.parser.dynamic_parser import DynamicParser  # noqa: E402
from app.services.parser.grid import open_grid  # noqa: E402
from app.services.parser.infer import (  # noqa: E402
    infer_from_filename, infer_metadata, infer_wafer_id,
)

from tests.test_real_formats import VENDORS, _find  # noqa: E402


def _sample(vendor):
    path = _find(vendor)
    if not path:
        pytest.skip("%s sample not available" % vendor)
    return open_grid(path, delimiter=VENDORS[vendor].get("text_delimiter"))


def _pick(result, key):
    for option in result.options:
        if option.key == key:
            return option
    return None


def _recommended(result):
    return next((o for o in result.options if o.recommended), None)


class TestWaferIdInference:
    def test_metadata_cell_with_suffix_offers_just_the_number(self):
        """世界先进's LOT ID cell reads "H2XR46.1-01"; the wafer is the "01"."""
        grid = _sample("世界先进")
        result = infer_wafer_id(grid, 4, 2, data_start_row=30)
        best = _recommended(result)
        assert best is not None
        assert best.preview == "01"
        # The user picked a value, not a pattern — but a pattern is what gets
        # stored, and it must actually produce that value.
        assert best.fields["wafer_id_pattern"]
        assert DynamicParser._refine("H2XR46.1-07",
                                     best.fields["wafer_id_pattern"]) == "07"

    def test_neighbouring_label_is_preferred_over_a_fixed_address(self):
        """禾纳's `wafer number` row drifts with the Bias block length, so
        anchoring on the label survives files a fixed address would miss."""
        grid = _sample("禾纳")
        result = infer_wafer_id(grid, 3, 2, data_start_row=17)
        assert result.label_text == "Wafer number"
        best = _recommended(result)
        assert best.fields["wafer_id_source"] == "label"
        assert best.fields["wafer_id_label"] == "Wafer number"
        assert best.preview == "001"

    def test_fixed_address_still_offered_as_an_alternative(self):
        grid = _sample("禾纳")
        result = infer_wafer_id(grid, 3, 2, data_start_row=17)
        fixed = _pick(result, "fixed")
        assert fixed is not None
        assert fixed.fields["wafer_id_source"] == "cell"
        assert fixed.fields["wafer_id_cell"] == "3,2"

    def test_click_inside_the_data_block_means_the_column(self):
        grid = _sample("东部高科")
        result = infer_wafer_id(grid, 16, 1, data_start_row=15)
        assert result.in_data_region
        best = _recommended(result)
        assert best.fields["wafer_id_source"] == "column"
        assert best.fields["wafer_id_col"] == 1

    def test_empty_cell_yields_no_options(self):
        grid = _sample("东部高科")
        assert infer_wafer_id(grid, 1, 20, data_start_row=15).options == []


class TestMetadataInference:
    def test_lot_cell_offers_dropping_the_wafer_suffix(self):
        """Keeping "H2XR46.1-01" as the lot splits one lot into five."""
        grid = _sample("世界先进")
        result = infer_metadata(grid, 4, 2, "lot", data_start_row=30)
        best = _recommended(result)
        assert best.preview == "H2XR46.1"
        assert DynamicParser._refine("H2XR46.1-05",
                                     best.fields["lot_id_pattern"]) == "H2XR46.1"

    def test_path_like_value_offers_only_the_leaf(self):
        """天狼芯 hides its model in the tester program path."""
        grid = _sample("天狼芯")
        result = infer_metadata(grid, 3, 2, "product", data_start_row=37)
        best = _recommended(result)
        assert best.key == "leaf"
        assert best.preview == "S0804NA-650V(P)-V3"

    def test_exactly_one_recommendation(self):
        grid = _sample("天狼芯")
        for role in ("product", "lot"):
            result = infer_metadata(grid, 3, 2, role, data_start_row=37)
            assert sum(1 for o in result.options if o.recommended) <= 1


class TestFilenameInference:
    NAME = "供应商：新洁能，型号NCETSG340KAA, 批号FA5Z-3372，号001.TXT"

    def test_reads_the_labelled_model(self):
        best = next(o for o in infer_from_filename(self.NAME, "product")
                    if o.recommended)
        assert best.preview == "NCETSG340KAA"

    def test_reads_the_labelled_lot(self):
        best = next(o for o in infer_from_filename(self.NAME, "lot")
                    if o.recommended)
        assert best.preview == "FA5Z-3372"

    def test_label_fragments_are_not_offered_as_values(self):
        """"型号NCETSG340KAA" is a label plus its value, never the model."""
        for option in infer_from_filename(self.NAME, "product"):
            assert "型" not in option.preview
            assert "批" not in option.preview


class TestFilenameFallback:
    """A template only reads the file name when it explicitly asks to.

    天狼芯 / 禾纳 / 新洁能 put a tester *program* name in the sheet and the real
    model only in the file name, so those templates opt in with a pattern and
    that pattern wins. Everyone else never looks at the name at all, which is
    what keeps a naming convention off vendors whose files state their model.
    """

    def _write(self, path):
        path.write_text("Device Name:,PROGRAMNAME\nWAFER,BIN,P1\n"
                        ",,0\n,,10\nW01,1,1.0\nW01,1,1.1\nW01,1,1.2\n"
                        "W01,1,1.3\nW01,1,1.4\n", encoding="utf-8")

    def _parser(self, **extra):
        return DynamicParser(
            vendor_code="T", header_row=2, lower_limit_row=3, upper_limit_row=4,
            data_start_row=5, electrical_start_col=3, wafer_id_col=1, bin_col=2,
            **extra)

    def test_configured_pattern_wins_over_the_sheet(self, tmp_path):
        path = tmp_path / "型号NCETSG340KAA.csv"
        self._write(path)
        parser = self._parser(product_id_label="Device Name",
                              product_id_filename_pattern=r"型号([A-Za-z0-9]+)")
        assert parser.parse(str(path)).product_id == "NCETSG340KAA"

    def test_sheet_is_the_fallback_when_the_name_does_not_match(self, tmp_path):
        """A file arriving without the expected name degrades to what the sheet
        says, rather than to nothing."""
        path = tmp_path / "randomly-named.csv"
        self._write(path)
        parser = self._parser(product_id_label="Device Name",
                              product_id_filename_pattern=r"型号([A-Za-z0-9]+)")
        assert parser.parse(str(path)).product_id == "PROGRAMNAME"

    def test_without_a_pattern_the_name_is_never_read(self, tmp_path):
        path = tmp_path / "型号SHOULDBEIGNORED.csv"
        self._write(path)
        assert self._parser(product_id_label="Device Name").parse(
            str(path)).product_id == "PROGRAMNAME"

    def test_file_name_used_when_contents_are_silent(self, tmp_path):
        path = tmp_path / "型号NCETSG340KAA.csv"
        path.write_text("WAFER,BIN,P1\n,,0\n,,10\n"
                        "W01,1,1.0\nW01,1,1.1\nW01,1,1.2\nW01,1,1.3\nW01,1,1.4\n",
                        encoding="utf-8")
        parser = DynamicParser(
            vendor_code="T", header_row=1, lower_limit_row=2, upper_limit_row=3,
            data_start_row=4, electrical_start_col=3, wafer_id_col=1, bin_col=2,
            product_id_filename_pattern=r"型号([A-Za-z0-9]+)")
        assert parser.parse(str(path)).product_id == "NCETSG340KAA"

    def test_absent_everywhere_stays_empty(self, tmp_path):
        path = tmp_path / "nothing.csv"
        path.write_text("WAFER,BIN,P1\n,,0\n,,10\n"
                        "W01,1,1.0\nW01,1,1.1\nW01,1,1.2\nW01,1,1.3\nW01,1,1.4\n",
                        encoding="utf-8")
        parser = DynamicParser(
            vendor_code="T", header_row=1, lower_limit_row=2, upper_limit_row=3,
            data_start_row=4, electrical_start_col=3, wafer_id_col=1, bin_col=2,
            product_id_filename_pattern=r"型号([A-Za-z0-9]+)")
        assert parser.parse(str(path)).product_id == ""


class TestRevisionDiff:
    def test_reports_only_changed_fields(self):
        changes = _diff({"header_row": 8, "bin_col": 12},
                        {"header_row": 10, "bin_col": 12})
        assert changes == [{"field": "header_row", "from": 8, "to": 10}]

    def test_first_revision_lists_the_fields_that_have_values(self):
        """An unset field is not a change, so it stays out of the diff."""
        changes = _diff(None, {"header_row": 8, "bin_col": None})
        assert {c["field"] for c in changes} == {"header_row"}
        assert all(c["from"] is None for c in changes)

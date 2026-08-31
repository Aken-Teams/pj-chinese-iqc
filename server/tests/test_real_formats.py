"""Regression tests over the real vendor files collected in the 2026-08 survey.

Six 無錫 suppliers plus 徐州's production JJW dump. Each one exercises a
descriptor the original template model could not express:

  东部高科  two-row header (params + id columns), metadata cells
  祥微      no spec-limit rows at all
  世界先进  no wafer id anywhere in the sheet — only a LOT ID suffix
  天狼芯    wafer id in a metadata cell; limits written as "200.0mV"
  禾纳      tab-delimited .txt; limits as "2 V"; label-anchored wafer id
  新洁能    tab-delimited .TXT, same family as 禾纳
  徐州 JJW  the existing production format, to prove nothing regressed

The sample files live under data/, which is gitignored, so every test skips
when its file is absent rather than failing.
"""
import os
import sys

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.parser.dynamic_parser import DynamicParser  # noqa: E402
from app.services.parser.grid import open_grid  # noqa: E402
from app.services.parser.layout_detect import detect_layout  # noqa: E402
from app.services.parser.measure import parse_measure, to_float  # noqa: E402

DATA_ROOT = os.path.join(os.path.dirname(__file__), "..", "..", "data")
WUXI_DIR = os.path.join(DATA_ROOT, "無錫")
XUZHOU_DIR = os.path.join(DATA_ROOT, "IQC", "extracted")


def _fix(name: str) -> str:
    """The sample archive was unzipped with the wrong codepage, so the CJK file
    names on disk are GBK bytes decoded as Big5. Recover them for matching."""
    try:
        return name.encode("big5", "ignore").decode("gbk", "ignore")
    except Exception:
        return name


def _find(keyword: str):
    if not os.path.isdir(WUXI_DIR):
        return None
    for dirpath, _, names in os.walk(WUXI_DIR):
        for name in sorted(names):
            if keyword in _fix(name):
                return os.path.join(dirpath, name)
    return None


# --- descriptors, one per vendor ---------------------------------------
BASE = dict(product_id_col=None, lot_id_col=None, x_coord_col=None,
            y_coord_col=None, fixed_die_count=None)

VENDORS = {
    "东部高科": dict(
        BASE, header_row=10, id_header_row=14, lower_limit_row=11,
        upper_limit_row=12, unit_row=13, data_start_row=15,
        electrical_start_col=7, wafer_id_source="column", wafer_id_col=1,
        bin_col=2, x_coord_col=3, y_coord_col=4,
        product_id_cell="5,2", lot_id_cell="4,2"),
    # Same layout family as 徐州's production JJW dump — TEST NUMBER / LOWER /
    # UPPER / UNIT stacked at the top — only the header row sits higher (5 v 8).
    "祥微": dict(
        BASE, header_row=5, lower_limit_row=2, upper_limit_row=3, unit_row=4,
        data_start_row=6, electrical_start_col=12, wafer_id_source="column",
        wafer_id_col=4, bin_col=9, x_coord_col=10, y_coord_col=11,
        product_id_col=1, lot_id_col=2),
    "世界先进": dict(
        BASE, header_row=19, lower_limit_row=23, upper_limit_row=22,
        data_start_row=30, electrical_start_col=6, bin_col=3,
        x_coord_col=4, y_coord_col=5,
        wafer_id_source="cell", wafer_id_cell="4,2",
        wafer_id_pattern=r"-(\d+)$",
        product_id_cell="2,2", lot_id_cell="4,2"),
    "天狼芯": dict(
        BASE, header_row=15, lower_limit_row=17, upper_limit_row=18,
        unit_row=16, data_start_row=37, electrical_start_col=9,
        bin_col=4, x_coord_col=2, y_coord_col=3,
        wafer_id_source="cell", wafer_id_cell="7,2",
        wafer_id_pattern=r"-(\d+)$", lot_id_cell="4,2"),
    "禾纳": dict(
        BASE, header_row=7, lower_limit_row=9, upper_limit_row=8,
        data_start_row=17, electrical_start_col=5, bin_col=4,
        x_coord_col=2, y_coord_col=3,
        wafer_id_source="label", wafer_id_label="wafer number",
        wafer_id_pattern=r"(\d+)", lot_id_label="Lot number",
        text_delimiter="tab"),
    "新洁能": dict(
        BASE, header_row=7, lower_limit_row=9, upper_limit_row=8,
        data_start_row=16, electrical_start_col=5, bin_col=4,
        x_coord_col=2, y_coord_col=3,
        wafer_id_source="label", wafer_id_label="Wafer number",
        wafer_id_pattern=r"(\d+)", lot_id_label="Lot number",
        text_delimiter="tab"),
}


def _parser(vendor: str) -> DynamicParser:
    return DynamicParser(vendor_code=vendor, **VENDORS[vendor])


def _require(vendor: str) -> str:
    path = _find(vendor)
    if not path:
        pytest.skip("%s sample not available" % vendor)
    return path


# --- unit parsing -------------------------------------------------------
class TestMeasureParsing:
    @pytest.mark.parametrize("raw,expected", [
        ("200.0mV", 0.2),          # 天狼芯
        ("2 V", 2.0),              # 禾纳
        ("0.005 V", 0.005),
        ("99.00uA", 99e-6),        # 新洁能
        ("100.0nA", 100e-9),
        ("2.200V", 2.2),
        ("0.001 A", 0.001),
        (" +1.000E+00", 1.0),      # plain scientific, no unit
        (".3", 0.3),
        (5, 5.0),
    ])
    def test_parses(self, raw, expected):
        assert to_float(raw) == pytest.approx(expected)

    @pytest.mark.parametrize("raw", ["NoData", "", None, "PASS#", "N"])
    def test_rejects_non_measurements(self, raw):
        assert to_float(raw) is None

    def test_keeps_unit_symbol(self):
        assert parse_measure("200.0mV").unit == "V"
        assert parse_measure("5").unit is None


# --- per-vendor parsing -------------------------------------------------
class TestRealVendorFormats:
    @pytest.mark.parametrize("vendor", list(VENDORS))
    def test_parses_without_error(self, vendor):
        path = _require(vendor)
        result = _parser(vendor).parse(path)
        assert result.wafers, "%s produced no wafers" % vendor
        assert result.param_names, "%s produced no parameters" % vendor
        assert result.total_rows > 0
        for wafer in result.wafers:
            assert wafer.wafer_id
            assert wafer.gross_die > 0

    @pytest.mark.parametrize("vendor", list(VENDORS))
    def test_preview_agrees_with_parse(self, vendor):
        path = _require(vendor)
        parser = _parser(vendor)
        preview = parser.preview(path)
        result = parser.parse(path)
        assert preview["wafersDetected"] == len(result.wafers)
        assert preview["dataRows"] == result.total_rows
        assert preview["paramNames"] == result.param_names

    def test_dongbu_reads_metadata_cells(self):
        path = _require("东部高科")
        result = _parser("东部高科").parse(path)
        assert result.product_id == "PJ0120N600G1"
        assert result.lot_id == "1ACX01"
        # Electrical block starts past the two limit-less PSCAN columns.
        assert result.param_names[0] == "OS"

    def test_shijie_derives_wafer_id_from_lot_suffix(self):
        """世界先进 files carry no wafer id at all; it is recovered from the
        LOT ID cell's "-01" suffix."""
        path = _require("世界先进")
        result = _parser("世界先进").parse(path)
        assert len(result.wafers) == 1
        assert result.wafers[0].wafer_id == "01"

    def test_tianlangxin_reads_unit_bearing_limits(self):
        path = _require("天狼芯")
        result = _parser("天狼芯").parse(path)
        assert len(result.wafers) == 1
        assert result.wafers[0].wafer_id == "01"
        limits = {s.param_name: s for s in result.cp_specs}
        assert "C-CONT" in limits
        # "200.0mV" must normalise to 0.2 V, not be dropped as unparseable.
        assert limits["C-CONT"].upper_limit == pytest.approx(0.2)

    @pytest.mark.parametrize("vendor", ["禾纳", "新洁能"])
    def test_tab_delimited_text_with_unit_limits(self, vendor):
        path = _require(vendor)
        result = _parser(vendor).parse(path)
        assert len(result.wafers) == 1
        # Bare digits: 禾纳's tab-delimited `wafer number` cell reads ",001",
        # and a wafer called ",001" would not match the same wafer read from
        # any other source.
        assert result.wafers[0].wafer_id.isdigit()
        specs = {s.param_name: s for s in result.cp_specs}
        assert "CONT" in specs
        assert specs["CONT"].upper_limit is not None
        assert specs["CONT"].lower_limit is not None
        assert specs["CONT"].upper_limit > specs["CONT"].lower_limit

    def test_xiangwei_matches_the_jjw_family(self):
        """祥微 stacks TEST NUMBER / LOWER / UPPER / UNIT exactly like 徐州's
        JJW dump, so one descriptor shape covers both sites."""
        path = _require("祥微")
        result = _parser("祥微").parse(path)
        assert result.lot_id == "APX817"
        specs = {s.param_name: s for s in result.cp_specs}
        assert specs["CONT"].upper_limit == pytest.approx(100.0)
        assert specs["VTH1_250UA"].lower_limit == pytest.approx(2.4)
        assert specs["VTH1_250UA"].upper_limit == pytest.approx(3.6)
        assert specs["CONT"].unit == "MV"


# --- label anchoring ----------------------------------------------------
class TestFileTypeCoverage:
    """Every extension the upload accepts must at least load into a Grid.

    Detection quality is asserted per-vendor elsewhere; this only guards the
    loader, since .xls and .xlsm take different code paths from .xlsx.
    """

    @pytest.mark.parametrize("ext", [".xls", ".xlsm"])
    def test_legacy_excel_loads(self, ext):
        import glob
        matches = sorted(glob.glob(os.path.join(XUZHOU_DIR, "*" + ext)))
        if not matches:
            pytest.skip("no %s sample available" % ext)
        grid = open_grid(matches[0])
        assert grid.n_rows > 0
        assert grid.n_cols > 0

    @pytest.mark.parametrize("delim,sep", [("tab", "\t"), ("comma", ",")])
    def test_delimiter_is_sniffed_when_not_forced(self, tmp_path, delim, sep):
        p = tmp_path / ("s_%s.txt" % delim)
        p.write_text(sep.join(["WAFER", "BIN", "P1"]) + "\n"
                     + sep.join(["W01", "1", "1.5"]) + "\n", encoding="utf-8")
        grid = open_grid(str(p))
        assert grid.delimiter == delim
        assert grid.cell(1, 1) == "WAFER"
        assert grid.cell(2, 3) == "1.5"

    def test_gbk_encoded_text_is_recovered(self, tmp_path):
        p = tmp_path / "gbk.csv"
        p.write_bytes("批号,片号\nA1,01\n".encode("gbk"))
        grid = open_grid(str(p))
        assert grid.cell(1, 1) == "批号"


class TestBrokenWorkbookDimensions:
    def test_recovers_a_workbook_with_a_bogus_dimension_record(self):
        """祥微's C02FP8 file declares its used range as a single cell, so the
        streaming reader saw an empty sheet and the whole 280 KB upload parsed
        to nothing. The loader must recover the real extent."""
        path = _find("C02FP8")
        if not path:
            pytest.skip("C02FP8 sample not available")
        grid = open_grid(path)
        assert grid.n_rows > 100
        assert grid.cell(5, 4) == "WaferID"


class TestLabelAnchoring:
    def test_finds_value_beside_label(self):
        path = _require("禾纳")
        grid = open_grid(path, delimiter="tab")
        assert grid.label_value("Lot number")

    def test_short_cell_cannot_hijack_a_label(self):
        """A one-character cell must not satisfy a multi-word label search:
        'A' normalises into a substring of 'waferid' and used to win."""
        path = _require("天狼芯")
        grid = open_grid(path)
        assert str(grid.label_value("Wafer ID")).startswith("12661004")


# --- blank rows no longer truncate --------------------------------------
class TestBlankRowHandling:
    def test_blank_row_does_not_end_the_parse(self, tmp_path):
        csv_path = tmp_path / "gap.csv"
        csv_path.write_text(
            "WAFER,BIN,X,Y,P1\n"      # r1 header
            ",,,,0\n"                  # r2 lower
            ",,,,10\n"                 # r3 upper
            "W01,1,0,0,1.0\n"          # r4 data
            "\n"                       # r5 blank — used to end the parse
            "W01,1,1,0,2.0\n"          # r6 data after the gap
            "W02,1,0,0,3.0\n",
            encoding="utf-8")
        parser = DynamicParser(
            vendor_code="T", header_row=1, lower_limit_row=2, upper_limit_row=3,
            data_start_row=4, electrical_start_col=5, wafer_id_col=1, bin_col=2,
            x_coord_col=3, y_coord_col=4, text_delimiter="comma")
        result = parser.parse(str(csv_path))
        assert result.total_rows == 3, "rows after the blank row were dropped"
        assert {w.wafer_id for w in result.wafers} == {"W01", "W02"}


# --- L1 layout detection ------------------------------------------------
# Fields the detector must recover unaided. Verified by hand against each file.
DETECT_TRUTH = {
    "东部高科": dict(data_start_row=15, header_row=10, lower_limit_row=11,
                 upper_limit_row=12, electrical_start_col=7, bin_col=2,
                 wafer_id_col=1),
    "祥微": dict(data_start_row=6, header_row=5, lower_limit_row=2,
               upper_limit_row=3, electrical_start_col=12, bin_col=9,
               wafer_id_col=4),
    "世界先进": dict(data_start_row=30, header_row=19, lower_limit_row=23,
                 upper_limit_row=22, electrical_start_col=6, bin_col=3),
    "天狼芯": dict(data_start_row=37, header_row=15, lower_limit_row=17,
                upper_limit_row=18, electrical_start_col=9, bin_col=4),
    "禾纳": dict(data_start_row=17, header_row=7, lower_limit_row=9,
               upper_limit_row=8, electrical_start_col=5, bin_col=4),
    "新洁能": dict(data_start_row=16, header_row=7, lower_limit_row=9,
                upper_limit_row=8, electrical_start_col=5, bin_col=4),
}


class TestLayoutDetection:
    @pytest.mark.parametrize("vendor", list(DETECT_TRUTH))
    def test_detects_layout_unaided(self, vendor):
        path = _require(vendor)
        grid = open_grid(path, delimiter=VENDORS[vendor].get("text_delimiter"))
        det = detect_layout(grid)
        for field_name, expected in DETECT_TRUTH[vendor].items():
            assert det.value(field_name) == expected, (
                "%s.%s -> %r (expected %r); evidence: %s"
                % (vendor, field_name, det.value(field_name), expected,
                   det.fields.get(field_name)))

    def test_statistics_rows_are_never_read_as_spec_limits(self):
        """世界先进 stacks Average/STDEV/MinData/MaxData above its data, and
        天狼芯 stacks Min/Max/AVE/STDEF. Both pair up under a magnitude test
        exactly like real limits — only the label tells them apart."""
        for vendor, stats_rows in (("世界先进", {25, 26, 27, 28}),
                                   ("天狼芯", {31, 32, 33, 34})):
            path = _require(vendor)
            grid = open_grid(path)
            det = detect_layout(grid)
            assert det.value("upper_limit_row") not in stats_rows
            assert det.value("lower_limit_row") not in stats_rows

    def test_test_number_row_is_never_read_as_a_limit(self):
        """徐州's JJW dump puts TEST NUMBER at r1, directly above LOWER LIMIT."""
        if not os.path.exists(JJW_FILE):
            pytest.skip("JJW sample missing")
        det = detect_layout(open_grid(JJW_FILE))
        assert det.value("upper_limit_row") == 3
        assert det.value("lower_limit_row") == 2

    def test_missing_wafer_id_is_reported_not_guessed(self):
        """世界先进 files carry no wafer id. The detector must say so and offer
        alternatives rather than pointing at an arbitrary column — guessing is
        what produced wafer ids like "1.4728" from an electrical value."""
        path = _require("世界先进")
        det = detect_layout(open_grid(path))
        assert det.value("wafer_id_source") is None
        assert "wafer_id_source" in det.missing
        assert any("片號" in w for w in det.warnings)

    def test_label_alone_cannot_assign_a_column(self):
        """禾纳 writes "Wafer number" as a metadata row above the data; taking
        it as a column header aimed the wafer id at the die-index column."""
        path = _require("禾纳")
        grid = open_grid(path, delimiter="tab")
        det = detect_layout(grid)
        assert det.value("wafer_id_col") != 1
        assert det.value("wafer_id_source") == "label"

    @pytest.mark.parametrize("vendor", list(DETECT_TRUTH))
    def test_every_candidate_carries_evidence(self, vendor):
        path = _require(vendor)
        grid = open_grid(path, delimiter=VENDORS[vendor].get("text_delimiter"))
        det = detect_layout(grid)
        for name, cand in det.fields.items():
            if cand is None:
                continue
            assert cand.evidence, "%s.%s has no evidence text" % (vendor, name)
            assert 0.0 <= cand.confidence <= 1.0


# --- 徐州 production format must not regress ---------------------------
JJW_FILE = os.path.join(XUZHOU_DIR, "Microsoft_Excel_Worksheet.xlsx")


@pytest.mark.skipif(not os.path.exists(JJW_FILE), reason="JJW sample missing")
class TestXuzhouJJW:
    CONFIG = dict(header_row=8, data_start_row=9, lower_limit_row=2,
                  upper_limit_row=3, unit_row=4, electrical_start_col=15,
                  wafer_id_col=4, bin_col=12, x_coord_col=13, y_coord_col=14,
                  product_id_col=1, lot_id_col=2, fixed_die_count=None)

    def test_parses_production_format(self):
        result = DynamicParser(vendor_code="JJW", **self.CONFIG).parse(JJW_FILE)
        assert result.product_id == "JI30050A"
        assert result.lot_id == "PD03414"
        assert result.wafers
        assert result.param_names

    def test_limits_come_from_the_labelled_rows(self):
        """r1 is TEST NUMBER and r2/r3 are LOWER/UPPER LIMIT. Reading r1 as a
        limit row is the mistake the layout detector has to avoid."""
        result = DynamicParser(vendor_code="JJW", **self.CONFIG).parse(JJW_FILE)
        specs = {s.param_name: s for s in result.cp_specs}
        first = result.param_names[0]
        assert specs[first].lower_limit == pytest.approx(0.0)
        assert specs[first].upper_limit == pytest.approx(0.1)

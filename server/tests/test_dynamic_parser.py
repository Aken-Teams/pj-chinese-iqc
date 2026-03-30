"""
Integration tests for DynamicParser with DZ, VIS, HJM vendor formats.

Tests verify that:
1. DynamicParser correctly reads column mappings from VendorFormat configs
2. Preview returns correct metadata (wafer count, params, product/lot IDs)
3. Full parse returns correct ParseResult structure
4. Electrical values, bins, coordinates are read from correct columns
5. CP specs (lower/upper limits) are read from correct rows
6. The review engine produces valid statistics from parsed data
"""
import os
import sys
import math
import pytest
import numpy as np

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.parser.dynamic_parser import DynamicParser
from app.services.review_engine import calculate_wafer_param_review

DATA_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "data", "IQC", "extracted")

# ---------------------------------------------------------------------------
# VendorFormat configs — same as generate_test_data.py
# ---------------------------------------------------------------------------

DZ_CONFIG = {
    "header_row": 1,
    "data_start_row": 4,
    "lower_limit_row": 2,
    "upper_limit_row": 3,
    "electrical_start_col": 5,
    "wafer_id_col": 1,
    "bin_col": 2,
    "x_coord_col": 3,
    "y_coord_col": 4,
    "product_id_col": None,
    "lot_id_col": None,
    "fixed_die_count": None,
}

VIS_CONFIG = {
    "header_row": 2,
    "data_start_row": 5,
    "lower_limit_row": 3,
    "upper_limit_row": 4,
    "electrical_start_col": 7,
    "wafer_id_col": 1,
    "bin_col": 3,
    "x_coord_col": 4,
    "y_coord_col": 5,
    "product_id_col": 2,
    "lot_id_col": 6,
    "fixed_die_count": 100,
}

HJM_CONFIG = {
    "header_row": 1,
    "data_start_row": 4,
    "lower_limit_row": 2,
    "upper_limit_row": 3,
    "electrical_start_col": 4,
    "wafer_id_col": 1,
    "bin_col": 2,
    "x_coord_col": None,
    "y_coord_col": None,
    "product_id_col": 3,
    "lot_id_col": None,
    "fixed_die_count": None,
}

EXPECTED = {
    "DZ": {
        "file": "test_DZ.xlsx",
        "num_wafers": 5,
        "dies_per_wafer": 50,
        "params": ["VTH_N", "VTH_P", "IDSAT_N", "IDSAT_P", "IOFF_N"],
        "product_id": None,   # DZ has no product_id_col
        "lot_id": None,       # DZ has no lot_id_col
    },
    "VIS": {
        "file": "test_VIS.xlsx",
        "num_wafers": 4,
        "dies_per_wafer": 100,
        "params": ["BV_DSS", "RDS_ON", "VGS_TH", "IGSS", "IDSS", "VF", "GAIN"],
        "product_id": "VIS-2024A",
        "lot_id": "VIS-L5678",
    },
    "HJM": {
        "file": "test_HJM.xlsx",
        "num_wafers": 3,
        "dies_per_wafer": 80,
        "params": ["IL_1310", "IL_1550", "RL_1310", "RL_1550", "PDL", "WDL"],
        "product_id": "HJM-3080",
        "lot_id": None,
    },
}


def _make_parser(vendor_code: str, config: dict) -> DynamicParser:
    return DynamicParser(vendor_code=vendor_code, **config)


def _file_path(vendor_code: str) -> str:
    return os.path.join(DATA_DIR, EXPECTED[vendor_code]["file"])


# ===========================================================================
# DZ Vendor Tests
# ===========================================================================

@pytest.mark.skipif(
    not os.path.exists(os.path.join(DATA_DIR, "test_DZ.xlsx")),
    reason="DZ test data not generated"
)
class TestDZParser:
    @pytest.fixture(scope="class")
    def parser(self):
        return _make_parser("DZ", DZ_CONFIG)

    @pytest.fixture(scope="class")
    def preview(self, parser):
        return parser.preview(_file_path("DZ"))

    @pytest.fixture(scope="class")
    def result(self, parser):
        return parser.parse(_file_path("DZ"))

    # -- Preview tests --
    def test_preview_wafer_count(self, preview):
        assert preview["wafersDetected"] == 5

    def test_preview_data_rows(self, preview):
        assert preview["dataRows"] == 5 * 50  # 250 total

    def test_preview_param_names(self, preview):
        assert preview["paramNames"] == ["VTH_N", "VTH_P", "IDSAT_N", "IDSAT_P", "IOFF_N"]

    def test_preview_format(self, preview):
        assert preview["format"] == "DZ"

    def test_preview_no_product_id(self, preview):
        """DZ has no product_id_col configured."""
        assert preview["productId"] is None

    def test_preview_no_lot_id(self, preview):
        """DZ has no lot_id_col configured."""
        assert preview["lotId"] is None

    # -- Parse tests --
    def test_parse_vendor_code(self, result):
        assert result.vendor_code == "DZ"

    def test_parse_wafer_count(self, result):
        assert len(result.wafers) == 5

    def test_parse_param_count(self, result):
        assert len(result.param_names) == 5

    def test_parse_param_names(self, result):
        assert result.param_names == ["VTH_N", "VTH_P", "IDSAT_N", "IDSAT_P", "IOFF_N"]

    def test_parse_total_rows(self, result):
        assert result.total_rows == 250

    def test_parse_wafer_ids(self, result):
        ids = [w.wafer_id for w in result.wafers]
        assert ids == ["W01", "W02", "W03", "W04", "W05"]

    def test_parse_dies_per_wafer(self, result):
        for w in result.wafers:
            assert w.gross_die == 50

    def test_parse_bin_values_valid(self, result):
        for w in result.wafers:
            for d in w.dies:
                assert d.bin in (1, 2, 3, 4)

    def test_parse_coordinates_present(self, result):
        """DZ has x/y coord columns."""
        for w in result.wafers:
            for d in w.dies:
                assert d.x_coord is not None
                assert d.y_coord is not None

    def test_parse_electrical_keys(self, result):
        for w in result.wafers:
            for d in w.dies:
                assert set(d.electrical.keys()) == {"VTH_N", "VTH_P", "IDSAT_N", "IDSAT_P", "IOFF_N"}

    def test_parse_electrical_values_numeric(self, result):
        for w in result.wafers:
            for d in w.dies:
                for val in d.electrical.values():
                    assert isinstance(val, float)

    def test_cp_specs_count(self, result):
        assert len(result.cp_specs) == 5

    def test_cp_specs_vth_n(self, result):
        spec = next(s for s in result.cp_specs if s.param_name == "VTH_N")
        assert spec.lower_limit == 0.35
        assert spec.upper_limit == 0.55

    def test_bin1_count_consistent(self, result):
        for w in result.wafers:
            actual_bin1 = sum(1 for d in w.dies if d.bin == 1)
            assert w.bin1_count == actual_bin1


# ===========================================================================
# VIS Vendor Tests
# ===========================================================================

@pytest.mark.skipif(
    not os.path.exists(os.path.join(DATA_DIR, "test_VIS.xlsx")),
    reason="VIS test data not generated"
)
class TestVISParser:
    @pytest.fixture(scope="class")
    def parser(self):
        return _make_parser("VIS", VIS_CONFIG)

    @pytest.fixture(scope="class")
    def preview(self, parser):
        return parser.preview(_file_path("VIS"))

    @pytest.fixture(scope="class")
    def result(self, parser):
        return parser.parse(_file_path("VIS"))

    # -- Preview tests --
    def test_preview_wafer_count(self, preview):
        assert preview["wafersDetected"] == 4

    def test_preview_data_rows(self, preview):
        assert preview["dataRows"] == 400

    def test_preview_param_names(self, preview):
        assert preview["paramNames"] == ["BV_DSS", "RDS_ON", "VGS_TH", "IGSS", "IDSS", "VF", "GAIN"]

    def test_preview_format(self, preview):
        assert preview["format"] == "VIS"

    def test_preview_product_id(self, preview):
        assert preview["productId"] == "VIS-2024A"

    def test_preview_lot_id(self, preview):
        assert preview["lotId"] == "VIS-L5678"

    def test_preview_die_per_wafer(self, preview):
        assert preview["diePerWafer"] == 100  # fixed_die_count

    # -- Parse tests --
    def test_parse_vendor_code(self, result):
        assert result.vendor_code == "VIS"

    def test_parse_wafer_count(self, result):
        assert len(result.wafers) == 4

    def test_parse_param_count(self, result):
        assert len(result.param_names) == 7

    def test_parse_total_rows(self, result):
        assert result.total_rows == 400

    def test_parse_product_id(self, result):
        assert result.product_id == "VIS-2024A"

    def test_parse_lot_id(self, result):
        assert result.lot_id == "VIS-L5678"

    def test_parse_wafer_ids(self, result):
        ids = [w.wafer_id for w in result.wafers]
        assert ids == ["W01", "W02", "W03", "W04"]

    def test_parse_dies_per_wafer(self, result):
        for w in result.wafers:
            assert w.gross_die == 100

    def test_parse_coordinates_present(self, result):
        for w in result.wafers:
            for d in w.dies:
                assert d.x_coord is not None
                assert d.y_coord is not None

    def test_parse_electrical_keys(self, result):
        expected = {"BV_DSS", "RDS_ON", "VGS_TH", "IGSS", "IDSS", "VF", "GAIN"}
        for w in result.wafers:
            for d in w.dies:
                assert set(d.electrical.keys()) == expected

    def test_cp_specs_count(self, result):
        assert len(result.cp_specs) == 7

    def test_cp_spec_bv_dss(self, result):
        spec = next(s for s in result.cp_specs if s.param_name == "BV_DSS")
        assert spec.lower_limit == 55.0

    def test_cp_spec_rds_on_upper_only(self, result):
        spec = next(s for s in result.cp_specs if s.param_name == "RDS_ON")
        assert spec.lower_limit is None
        assert spec.upper_limit == 0.05

    def test_cp_spec_gain_lower_only(self, result):
        spec = next(s for s in result.cp_specs if s.param_name == "GAIN")
        assert spec.lower_limit == 20.0
        assert spec.upper_limit is None

    def test_bin1_count_consistent(self, result):
        for w in result.wafers:
            actual_bin1 = sum(1 for d in w.dies if d.bin == 1)
            assert w.bin1_count == actual_bin1


# ===========================================================================
# HJM Vendor Tests
# ===========================================================================

@pytest.mark.skipif(
    not os.path.exists(os.path.join(DATA_DIR, "test_HJM.xlsx")),
    reason="HJM test data not generated"
)
class TestHJMParser:
    @pytest.fixture(scope="class")
    def parser(self):
        return _make_parser("HJM", HJM_CONFIG)

    @pytest.fixture(scope="class")
    def preview(self, parser):
        return parser.preview(_file_path("HJM"))

    @pytest.fixture(scope="class")
    def result(self, parser):
        return parser.parse(_file_path("HJM"))

    # -- Preview tests --
    def test_preview_wafer_count(self, preview):
        assert preview["wafersDetected"] == 3

    def test_preview_data_rows(self, preview):
        assert preview["dataRows"] == 240

    def test_preview_param_names(self, preview):
        assert preview["paramNames"] == ["IL_1310", "IL_1550", "RL_1310", "RL_1550", "PDL", "WDL"]

    def test_preview_format(self, preview):
        assert preview["format"] == "HJM"

    def test_preview_product_id(self, preview):
        assert preview["productId"] == "HJM-3080"

    def test_preview_no_lot_id(self, preview):
        """HJM has no lot_id_col configured."""
        assert preview["lotId"] is None

    # -- Parse tests --
    def test_parse_vendor_code(self, result):
        assert result.vendor_code == "HJM"

    def test_parse_wafer_count(self, result):
        assert len(result.wafers) == 3

    def test_parse_param_count(self, result):
        assert len(result.param_names) == 6

    def test_parse_total_rows(self, result):
        assert result.total_rows == 240

    def test_parse_product_id(self, result):
        assert result.product_id == "HJM-3080"

    def test_parse_wafer_ids(self, result):
        ids = [w.wafer_id for w in result.wafers]
        assert ids == ["W01", "W02", "W03"]

    def test_parse_dies_per_wafer(self, result):
        for w in result.wafers:
            assert w.gross_die == 80

    def test_parse_no_coordinates(self, result):
        """HJM has no x/y coord columns configured."""
        for w in result.wafers:
            for d in w.dies:
                assert d.x_coord is None
                assert d.y_coord is None

    def test_parse_electrical_keys(self, result):
        expected = {"IL_1310", "IL_1550", "RL_1310", "RL_1550", "PDL", "WDL"}
        for w in result.wafers:
            for d in w.dies:
                assert set(d.electrical.keys()) == expected

    def test_cp_specs_count(self, result):
        assert len(result.cp_specs) == 6

    def test_cp_spec_il_1310_upper_only(self, result):
        spec = next(s for s in result.cp_specs if s.param_name == "IL_1310")
        assert spec.lower_limit is None
        assert spec.upper_limit == 0.5

    def test_cp_spec_rl_1310_lower_only(self, result):
        spec = next(s for s in result.cp_specs if s.param_name == "RL_1310")
        assert spec.lower_limit == 45.0
        assert spec.upper_limit is None

    def test_bin1_count_consistent(self, result):
        for w in result.wafers:
            actual_bin1 = sum(1 for d in w.dies if d.bin == 1)
            assert w.bin1_count == actual_bin1


# ===========================================================================
# Cross-vendor review engine integration tests
# ===========================================================================

class TestReviewEngineWithDynamicParser:
    """Verify review_engine produces valid stats from DynamicParser output."""

    @pytest.fixture(scope="class")
    def all_results(self):
        """Parse all 3 vendor files and return results keyed by vendor code."""
        out = {}
        for vc, cfg in [("DZ", DZ_CONFIG), ("VIS", VIS_CONFIG), ("HJM", HJM_CONFIG)]:
            fp = _file_path(vc)
            if os.path.exists(fp):
                parser = _make_parser(vc, cfg)
                out[vc] = parser.parse(fp)
        return out

    @pytest.mark.parametrize("vendor_code", ["DZ", "VIS", "HJM"])
    def test_review_engine_produces_valid_stats(self, all_results, vendor_code):
        if vendor_code not in all_results:
            pytest.skip(f"{vendor_code} data not available")
        result = all_results[vendor_code]
        wafer = result.wafers[0]
        pname = result.param_names[0]
        values = [d.electrical[pname] for d in wafer.dies if d.electrical[pname] is not None]
        spec = next((s for s in result.cp_specs if s.param_name == pname), None)

        stats = calculate_wafer_param_review(
            values=values,
            total_die_count=wafer.gross_die,
            q1_lower=spec.lower_limit if spec else None,
            q1_upper=spec.upper_limit if spec else None,
            q2_lower=None, q2_upper=None,
            q3_lower=None, q3_upper=None,
        )

        assert not math.isnan(stats["average"])
        assert stats["stdev"] >= 0
        assert stats["max_val"] >= stats["min_val"]
        assert 0 <= stats["bin1_yield"] <= 1
        assert 0 <= stats["q1_yield"] <= 1

    @pytest.mark.parametrize("vendor_code", ["DZ", "VIS", "HJM"])
    def test_review_average_matches_numpy(self, all_results, vendor_code):
        if vendor_code not in all_results:
            pytest.skip(f"{vendor_code} data not available")
        result = all_results[vendor_code]
        wafer = result.wafers[0]
        pname = result.param_names[0]
        values = [d.electrical[pname] for d in wafer.dies if d.electrical[pname] is not None]

        stats = calculate_wafer_param_review(
            values=values,
            total_die_count=wafer.gross_die,
            q1_lower=None, q1_upper=None,
            q2_lower=None, q2_upper=None,
            q3_lower=None, q3_upper=None,
        )

        np_mean = float(np.mean(values))
        np_std = float(np.std(values, ddof=1))
        assert abs(stats["average"] - np_mean) < 1e-8
        assert abs(stats["stdev"] - np_std) < 1e-8

    @pytest.mark.parametrize("vendor_code", ["DZ", "VIS", "HJM"])
    def test_all_wafers_produce_valid_results(self, all_results, vendor_code):
        """Every wafer × every param should produce finite stats."""
        if vendor_code not in all_results:
            pytest.skip(f"{vendor_code} data not available")
        result = all_results[vendor_code]
        for wafer in result.wafers:
            for pname in result.param_names:
                values = [d.electrical[pname] for d in wafer.dies if d.electrical.get(pname) is not None]
                if not values:
                    continue
                spec = next((s for s in result.cp_specs if s.param_name == pname), None)
                stats = calculate_wafer_param_review(
                    values=values,
                    total_die_count=wafer.gross_die,
                    q1_lower=spec.lower_limit if spec else None,
                    q1_upper=spec.upper_limit if spec else None,
                    q2_lower=None, q2_upper=None,
                    q3_lower=None, q3_upper=None,
                )
                assert math.isfinite(stats["average"]), f"{vendor_code}/{wafer.wafer_id}/{pname}"
                assert math.isfinite(stats["stdev"]), f"{vendor_code}/{wafer.wafer_id}/{pname}"

    @pytest.mark.parametrize("vendor_code", ["DZ", "VIS", "HJM"])
    def test_bin1_yield_is_reasonable(self, all_results, vendor_code):
        """Most wafers should have >50% bin1 yield (data is ~95% in-spec)."""
        if vendor_code not in all_results:
            pytest.skip(f"{vendor_code} data not available")
        result = all_results[vendor_code]
        yields = []
        for w in result.wafers:
            if w.gross_die > 0:
                yields.append(w.bin1_count / w.gross_die)
        avg_yield = sum(yields) / len(yields)
        assert avg_yield > 0.3, f"{vendor_code} avg bin1 yield too low: {avg_yield:.2%}"


# ===========================================================================
# from_vendor_format factory test (simulated VendorFormat ORM object)
# ===========================================================================

class TestFromVendorFormat:
    """Test DynamicParser.from_vendor_format with a mock VendorFormat object."""

    def test_factory_creates_parser_with_correct_config(self):
        class MockFormat:
            header_row = 2
            data_start_row = 4
            lower_limit_row = 3
            upper_limit_row = 3
            electrical_start_col = 7
            wafer_id_col = 1
            bin_col = 3
            x_coord_col = 4
            y_coord_col = 5
            product_id_col = 2
            lot_id_col = 6
            fixed_die_count = 100

        parser = DynamicParser.from_vendor_format("TEST", MockFormat())
        assert parser.vendor_code == "TEST"
        assert parser.HEADER_ROW == 2
        assert parser.DATA_START_ROW == 4
        assert parser.LOWER_LIMIT_ROW == 3
        assert parser.UPPER_LIMIT_ROW == 3
        assert parser.ELECTRICAL_START_COL == 7
        assert parser.WAFER_ID_COL == 1
        assert parser.BIN_COL == 3
        assert parser.X_COORD_COL == 4
        assert parser.Y_COORD_COL == 5
        assert parser.PRODUCT_ID_COL == 2
        assert parser.LOT_ID_COL == 6
        assert parser.FIXED_DIE_COUNT == 100

    def test_factory_nullable_fields(self):
        class MockFormat:
            header_row = 1
            data_start_row = 3
            lower_limit_row = 2
            upper_limit_row = 2
            electrical_start_col = 4
            wafer_id_col = 1
            bin_col = 2
            x_coord_col = None
            y_coord_col = None
            product_id_col = None
            lot_id_col = None
            fixed_die_count = None

        parser = DynamicParser.from_vendor_format("NULL", MockFormat())
        assert parser.X_COORD_COL is None
        assert parser.Y_COORD_COL is None
        assert parser.PRODUCT_ID_COL is None
        assert parser.LOT_ID_COL is None
        assert parser.FIXED_DIE_COUNT is None


# ===========================================================================
# Cross-validation: DynamicParser vs hardcoded JJW/XRW parsers
# Proves hardcoded parsers can be fully replaced by DynamicParser + config
# ===========================================================================

JJW_FILE = os.path.join(DATA_DIR, "Microsoft_Excel_Worksheet.xlsx")
XRW_FILE = os.path.join(DATA_DIR, "Microsoft_Excel_Worksheet1.xlsx")

JJW_AS_DYNAMIC_CONFIG = {
    "header_row": 8,
    "data_start_row": 9,
    "lower_limit_row": 2,
    "upper_limit_row": 3,
    "electrical_start_col": 15,
    "wafer_id_col": 4,
    "bin_col": 12,
    "x_coord_col": 13,
    "y_coord_col": 14,
    "product_id_col": 1,
    "lot_id_col": 2,
    "fixed_die_count": None,
}

XRW_AS_DYNAMIC_CONFIG = {
    "header_row": 5,
    "data_start_row": 6,
    "lower_limit_row": 2,
    "upper_limit_row": 3,
    "electrical_start_col": 12,
    "wafer_id_col": 4,
    "bin_col": 9,
    "x_coord_col": 10,
    "y_coord_col": 11,
    "product_id_col": 1,
    "lot_id_col": 2,
    "fixed_die_count": 208,
}


@pytest.mark.skipif(
    not os.path.exists(JJW_FILE),
    reason="JJW real data file not found"
)
class TestDynamicVsHardcodedJJW:
    """Prove DynamicParser produces identical results to JJWParser."""

    @pytest.fixture(scope="class")
    def hardcoded_result(self):
        from app.services.parser.jjw_parser import JJWParser
        return JJWParser().parse(JJW_FILE)

    @pytest.fixture(scope="class")
    def dynamic_result(self):
        return DynamicParser(vendor_code="JJW", **JJW_AS_DYNAMIC_CONFIG).parse(JJW_FILE)

    def test_same_vendor_code(self, hardcoded_result, dynamic_result):
        assert dynamic_result.vendor_code == hardcoded_result.vendor_code

    def test_same_product_id(self, hardcoded_result, dynamic_result):
        assert dynamic_result.product_id == hardcoded_result.product_id

    def test_same_lot_id(self, hardcoded_result, dynamic_result):
        assert dynamic_result.lot_id == hardcoded_result.lot_id

    def test_same_wafer_count(self, hardcoded_result, dynamic_result):
        assert len(dynamic_result.wafers) == len(hardcoded_result.wafers)

    def test_same_param_names(self, hardcoded_result, dynamic_result):
        assert dynamic_result.param_names == hardcoded_result.param_names

    def test_same_total_rows(self, hardcoded_result, dynamic_result):
        assert dynamic_result.total_rows == hardcoded_result.total_rows

    def test_same_wafer_ids(self, hardcoded_result, dynamic_result):
        hc_ids = [w.wafer_id for w in hardcoded_result.wafers]
        dy_ids = [w.wafer_id for w in dynamic_result.wafers]
        assert dy_ids == hc_ids

    def test_same_gross_die_per_wafer(self, hardcoded_result, dynamic_result):
        for hc_w, dy_w in zip(hardcoded_result.wafers, dynamic_result.wafers):
            assert dy_w.gross_die == hc_w.gross_die, f"Wafer {hc_w.wafer_id}"

    def test_same_bin1_count_per_wafer(self, hardcoded_result, dynamic_result):
        for hc_w, dy_w in zip(hardcoded_result.wafers, dynamic_result.wafers):
            assert dy_w.bin1_count == hc_w.bin1_count, f"Wafer {hc_w.wafer_id}"

    def test_same_cp_specs(self, hardcoded_result, dynamic_result):
        for hc_s, dy_s in zip(hardcoded_result.cp_specs, dynamic_result.cp_specs):
            assert dy_s.param_name == hc_s.param_name
            assert dy_s.lower_limit == hc_s.lower_limit, f"{hc_s.param_name} lower"
            assert dy_s.upper_limit == hc_s.upper_limit, f"{hc_s.param_name} upper"

    def test_same_electrical_values_wafer01(self, hardcoded_result, dynamic_result):
        """Spot-check: every die's electrical values match for first wafer."""
        hc_dies = hardcoded_result.wafers[0].dies
        dy_dies = dynamic_result.wafers[0].dies
        assert len(dy_dies) == len(hc_dies)
        for i, (hc_d, dy_d) in enumerate(zip(hc_dies, dy_dies)):
            assert dy_d.bin == hc_d.bin, f"Die {i} bin"
            assert dy_d.x_coord == hc_d.x_coord, f"Die {i} x_coord"
            assert dy_d.y_coord == hc_d.y_coord, f"Die {i} y_coord"
            for pname in hardcoded_result.param_names:
                assert dy_d.electrical[pname] == hc_d.electrical[pname], \
                    f"Die {i} param {pname}"

    def test_same_electrical_values_all_wafers(self, hardcoded_result, dynamic_result):
        """Every die across all wafers must match exactly."""
        for wi, (hc_w, dy_w) in enumerate(zip(hardcoded_result.wafers, dynamic_result.wafers)):
            for di, (hc_d, dy_d) in enumerate(zip(hc_w.dies, dy_w.dies)):
                for pname in hardcoded_result.param_names:
                    assert dy_d.electrical[pname] == hc_d.electrical[pname], \
                        f"Wafer {hc_w.wafer_id} die {di} param {pname}"


@pytest.mark.skipif(
    not os.path.exists(XRW_FILE),
    reason="XRW real data file not found"
)
class TestDynamicVsHardcodedXRW:
    """Prove DynamicParser produces identical results to XRWParser."""

    @pytest.fixture(scope="class")
    def hardcoded_result(self):
        from app.services.parser.xrw_parser import XRWParser
        return XRWParser().parse(XRW_FILE)

    @pytest.fixture(scope="class")
    def dynamic_result(self):
        return DynamicParser(vendor_code="XRW", **XRW_AS_DYNAMIC_CONFIG).parse(XRW_FILE)

    def test_same_vendor_code(self, hardcoded_result, dynamic_result):
        assert dynamic_result.vendor_code == hardcoded_result.vendor_code

    def test_same_product_id(self, hardcoded_result, dynamic_result):
        assert dynamic_result.product_id == hardcoded_result.product_id

    def test_same_lot_id(self, hardcoded_result, dynamic_result):
        assert dynamic_result.lot_id == hardcoded_result.lot_id

    def test_same_wafer_count(self, hardcoded_result, dynamic_result):
        assert len(dynamic_result.wafers) == len(hardcoded_result.wafers)

    def test_same_param_names(self, hardcoded_result, dynamic_result):
        assert dynamic_result.param_names == hardcoded_result.param_names

    def test_same_total_rows(self, hardcoded_result, dynamic_result):
        assert dynamic_result.total_rows == hardcoded_result.total_rows

    def test_same_wafer_ids(self, hardcoded_result, dynamic_result):
        hc_ids = [w.wafer_id for w in hardcoded_result.wafers]
        dy_ids = [w.wafer_id for w in dynamic_result.wafers]
        assert dy_ids == hc_ids

    def test_same_gross_die_per_wafer(self, hardcoded_result, dynamic_result):
        for hc_w, dy_w in zip(hardcoded_result.wafers, dynamic_result.wafers):
            assert dy_w.gross_die == hc_w.gross_die, f"Wafer {hc_w.wafer_id}"

    def test_same_bin1_count_per_wafer(self, hardcoded_result, dynamic_result):
        for hc_w, dy_w in zip(hardcoded_result.wafers, dynamic_result.wafers):
            assert dy_w.bin1_count == hc_w.bin1_count, f"Wafer {hc_w.wafer_id}"

    def test_same_cp_specs(self, hardcoded_result, dynamic_result):
        for hc_s, dy_s in zip(hardcoded_result.cp_specs, dynamic_result.cp_specs):
            assert dy_s.param_name == hc_s.param_name
            assert dy_s.lower_limit == hc_s.lower_limit, f"{hc_s.param_name} lower"
            assert dy_s.upper_limit == hc_s.upper_limit, f"{hc_s.param_name} upper"

    def test_same_electrical_values_wafer01(self, hardcoded_result, dynamic_result):
        hc_dies = hardcoded_result.wafers[0].dies
        dy_dies = dynamic_result.wafers[0].dies
        assert len(dy_dies) == len(hc_dies)
        for i, (hc_d, dy_d) in enumerate(zip(hc_dies, dy_dies)):
            assert dy_d.bin == hc_d.bin, f"Die {i} bin"
            assert dy_d.x_coord == hc_d.x_coord, f"Die {i} x_coord"
            assert dy_d.y_coord == hc_d.y_coord, f"Die {i} y_coord"
            for pname in hardcoded_result.param_names:
                assert dy_d.electrical[pname] == hc_d.electrical[pname], \
                    f"Die {i} param {pname}"

    def test_same_electrical_values_all_wafers(self, hardcoded_result, dynamic_result):
        for wi, (hc_w, dy_w) in enumerate(zip(hardcoded_result.wafers, dynamic_result.wafers)):
            for di, (hc_d, dy_d) in enumerate(zip(hc_w.dies, dy_w.dies)):
                for pname in hardcoded_result.param_names:
                    assert dy_d.electrical[pname] == hc_d.electrical[pname], \
                        f"Wafer {hc_w.wafer_id} die {di} param {pname}"

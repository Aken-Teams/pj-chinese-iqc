"""
Comprehensive tests for review_engine.calculate_wafer_param_review.

Key correctness requirement (VBA port):
  VBA uses CountIfs(range, ">" & QIL, range, "<" & QIU) — STRICT inequalities.
  A value exactly equal to QIL or QIU counts as FAILING, not passing.
  Python must use (arr > lower) & (arr < upper), NOT (arr >= lower) & (arr <= upper).

Formulae verified:
  bin1_yield  = count(bin==1 values supplied) / total_die_count
  q_yield     = count(lower < value < upper) / total_die_count  [strict]
  average     = numpy mean
  stdev       = numpy std with ddof=1 (sample stdev, matching VBA STDEV)
  max_val     = numpy max
  min_val     = numpy min
"""

import math
import os
import sys
import pytest
import numpy as np

# Allow importing from the server package without installation
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app.services.review_engine import calculate_wafer_param_review

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _calc(values, total_die_count=None, q1_lower=None, q1_upper=None,
          q2_lower=None, q2_upper=None, q3_lower=None, q3_upper=None):
    """Thin wrapper; total_die_count defaults to len(values) for convenience."""
    if total_die_count is None:
        total_die_count = len(values)
    return calculate_wafer_param_review(
        values=values,
        total_die_count=total_die_count,
        q1_lower=q1_lower, q1_upper=q1_upper,
        q2_lower=q2_lower, q2_upper=q2_upper,
        q3_lower=q3_lower, q3_upper=q3_upper,
    )


# ---------------------------------------------------------------------------
# Section 1: Empty / trivial input
# ---------------------------------------------------------------------------

class TestEmptyInput:
    def test_empty_values_returns_all_zeros(self):
        # With an empty values list AND no spec defined, q_yield should be None
        # (N/A — no rule). When a spec IS defined but there are no values,
        # q_yield should be 0.0.
        result = _calc([], total_die_count=10)
        assert result["average"] == 0.0
        assert result["stdev"] == 0.0
        assert result["max_val"] == 0.0
        assert result["min_val"] == 0.0
        assert result["bin1_yield"] == 0.0
        assert result["q1_yield"] is None
        assert result["q2_yield"] is None
        assert result["q3_yield"] is None

    def test_empty_values_with_spec_q_yield_is_zero(self):
        result = _calc([], total_die_count=10, q1_lower=0.0, q1_upper=1.0)
        assert result["q1_yield"] == 0.0

    def test_single_value_stdev_is_zero(self):
        result = _calc([5.0], total_die_count=1)
        assert result["stdev"] == 0.0
        assert result["average"] == 5.0
        assert result["max_val"] == 5.0
        assert result["min_val"] == 5.0

    def test_zero_total_die_count_bin1_yield_is_zero(self):
        # When total_die_count=0, bin1_yield is guarded to 0.0.
        result = _calc([1.0, 2.0, 3.0], total_die_count=0)
        assert result["bin1_yield"] == 0.0

    def test_zero_total_die_count_with_spec_q_yield_is_zero(self):
        # When total_die_count=0 AND a spec is provided, the count/0 guard
        # fires and q_yield is 0.0.
        result = _calc([1.0, 2.0, 3.0], total_die_count=0,
                       q1_lower=0.0, q1_upper=10.0)
        assert result["q1_yield"] == 0.0

    def test_zero_total_die_count_no_spec_q_yield_is_none(self):
        # No spec defined -> yield is None (N/A). CP review must NOT
        # default to "pass" when no rule exists.
        result = _calc([1.0, 2.0, 3.0], total_die_count=0,
                       q1_lower=None, q1_upper=None)
        assert result["q1_yield"] is None


# ---------------------------------------------------------------------------
# Section 2: Bin-1 yield
# ---------------------------------------------------------------------------

class TestBin1Yield:
    """bin1_yield = len(values supplied as bin-1) / total_die_count."""

    def test_all_bin1(self):
        # 10 bin-1 dies out of 10 total -> 100%
        result = _calc([1.0] * 10, total_die_count=10)
        assert result["bin1_yield"] == pytest.approx(1.0)

    def test_partial_bin1(self):
        # 10 bin-1 values, but 12 total dies on wafer
        result = _calc([1.0] * 10, total_die_count=12)
        assert result["bin1_yield"] == pytest.approx(10 / 12)

    def test_no_bin1(self):
        # 0 bin-1 values, 5 total dies
        result = _calc([], total_die_count=5)
        assert result["bin1_yield"] == 0.0

    def test_bin1_yield_xrw_wafer01_all_bin1(self):
        """XRW wafer 01 has 208 dies, all bin-1. bin1_yield must be 1.0."""
        result = _calc([1.0] * 208, total_die_count=208)
        assert result["bin1_yield"] == pytest.approx(1.0)

    def test_bin1_yield_jjw_wafer02_one_non_bin1(self):
        """JJW wafer 02 has 204 total, 203 bin-1. bin1_yield = 203/204."""
        result = _calc([1.0] * 203, total_die_count=204)
        assert result["bin1_yield"] == pytest.approx(203 / 204)


# ---------------------------------------------------------------------------
# Section 3: Descriptive statistics
# ---------------------------------------------------------------------------

class TestDescriptiveStatistics:
    """Average, stdev (ddof=1), max, min."""

    VALUES_10 = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
    EXPECTED_AVG = 5.5
    EXPECTED_STD = pytest.approx(np.std(VALUES_10, ddof=1))
    EXPECTED_MIN = 1.0
    EXPECTED_MAX = 10.0

    def test_average(self):
        result = _calc(self.VALUES_10)
        assert result["average"] == pytest.approx(self.EXPECTED_AVG)

    def test_stdev_uses_ddof1(self):
        """VBA STDEV is sample stdev (ddof=1), NOT population stdev (ddof=0)."""
        result = _calc(self.VALUES_10)
        expected = float(np.std(self.VALUES_10, ddof=1))
        assert result["stdev"] == pytest.approx(expected)

    def test_stdev_is_not_population_stdev(self):
        """Sanity: sample stdev != population stdev for small samples."""
        result = _calc(self.VALUES_10)
        population_std = float(np.std(self.VALUES_10, ddof=0))
        assert result["stdev"] != pytest.approx(population_std)

    def test_max_val(self):
        result = _calc(self.VALUES_10)
        assert result["max_val"] == self.EXPECTED_MAX

    def test_min_val(self):
        result = _calc(self.VALUES_10)
        assert result["min_val"] == self.EXPECTED_MIN

    def test_single_value_statistics(self):
        result = _calc([42.0])
        assert result["average"] == pytest.approx(42.0)
        assert result["stdev"] == pytest.approx(0.0)
        assert result["max_val"] == pytest.approx(42.0)
        assert result["min_val"] == pytest.approx(42.0)

    def test_negative_values(self):
        vals = [-5.0, -3.0, -1.0, 1.0, 3.0]
        result = _calc(vals)
        assert result["average"] == pytest.approx(-1.0)
        assert result["min_val"] == pytest.approx(-5.0)
        assert result["max_val"] == pytest.approx(3.0)
        assert result["stdev"] == pytest.approx(float(np.std(vals, ddof=1)))


# ---------------------------------------------------------------------------
# Section 4: Q-yield — strict inequality (core VBA correctness test)
# ---------------------------------------------------------------------------

class TestQYieldStrictInequality:
    """
    The VBA COUNTIFS formula uses STRICT inequalities:
        CountIfs(range, ">" & QIL, range, "<" & QIU)

    A value EXACTLY equal to a limit counts as FAILING.
    Python must use (arr > lower) & (arr < upper).
    """

    # Dataset: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], total_die=12
    VALUES = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
    TOTAL = 12

    def test_boundary_value_at_lower_limit_fails(self):
        """A value exactly equal to the lower limit must FAIL (strict >)."""
        # Value 2.0 is exactly at lower=2.0 -> should NOT be counted as passing
        result = _calc([2.0], total_die_count=1, q1_lower=2.0, q1_upper=5.0)
        assert result["q1_yield"] == pytest.approx(0.0), (
            "Value == lower limit must FAIL with strict inequality (VBA: '>' not '>=')"
        )

    def test_boundary_value_at_upper_limit_fails(self):
        """A value exactly equal to the upper limit must FAIL (strict <)."""
        result = _calc([5.0], total_die_count=1, q1_lower=2.0, q1_upper=5.0)
        assert result["q1_yield"] == pytest.approx(0.0), (
            "Value == upper limit must FAIL with strict inequality (VBA: '<' not '<=')"
        )

    def test_value_strictly_inside_limits_passes(self):
        """A value strictly between limits must PASS."""
        result = _calc([3.5], total_die_count=1, q1_lower=2.0, q1_upper=5.0)
        assert result["q1_yield"] == pytest.approx(1.0)

    def test_strict_vs_inclusive_differ_at_boundary(self):
        """
        With values [1..10], limits lower=2.0, upper=8.0:
          - Strict (VBA):   values 3,4,5,6,7 pass => 5 pass out of 12 total
          - Inclusive (bug): values 2,3,4,5,6,7,8 pass => 7 pass out of 12
        """
        result = _calc(self.VALUES, total_die_count=self.TOTAL,
                       q1_lower=2.0, q1_upper=8.0)
        # Strict: 3,4,5,6,7 -> 5 values pass
        assert result["q1_yield"] == pytest.approx(5 / 12), (
            "Expected strict Q-yield 5/12 but got inclusive 7/12 — "
            "boundary values 2.0 and 8.0 must FAIL"
        )
        # Explicitly confirm it is NOT the inclusive answer
        assert result["q1_yield"] != pytest.approx(7 / 12)

    def test_all_values_at_lower_boundary_yield_zero(self):
        """
        All values == lower limit => strict yield = 0.
        This mirrors the real JJW IGS0_5V&Bin3 parameter where all 204 dies
        read exactly 0.0 and the lower spec limit is also 0.0.
        """
        vals = [0.0] * 10
        result = _calc(vals, total_die_count=10,
                       q1_lower=0.0, q1_upper=10.0)
        assert result["q1_yield"] == pytest.approx(0.0), (
            "All values at lower boundary must all FAIL (strict >)"
        )

    def test_some_values_at_lower_boundary_partial_yield(self):
        """
        Mirrors JJW IDS0_24V&Bin4 on wafer 01:
          - 71 values at 0.0 (lower limit)
          - 133 values > 0.0 and < 40.0
          - total_die_count = 204
          - strict q_yield = 133/204
        We use a scaled-down synthetic version: 7 at boundary, 13 inside.
        """
        boundary_vals = [0.0] * 7
        inside_vals   = [5.0] * 13
        total = 20
        result = _calc(boundary_vals + inside_vals, total_die_count=total,
                       q1_lower=0.0, q1_upper=40.0)
        assert result["q1_yield"] == pytest.approx(13 / 20), (
            "Values exactly at lower limit must not contribute to Q-yield"
        )

    def test_lower_only_strict(self):
        """Only a lower bound: yield = count(values > lower) / total."""
        result = _calc(self.VALUES, total_die_count=self.TOTAL,
                       q1_lower=3.0, q1_upper=None)
        # Values > 3.0: 4,5,6,7,8,9,10 -> 7
        assert result["q1_yield"] == pytest.approx(7 / 12)

    def test_upper_only_strict(self):
        """Only an upper bound: yield = count(values < upper) / total."""
        result = _calc(self.VALUES, total_die_count=self.TOTAL,
                       q1_lower=None, q1_upper=7.0)
        # Values < 7.0: 1,2,3,4,5,6 -> 6
        assert result["q1_yield"] == pytest.approx(6 / 12)

    def test_no_spec_yields_none(self):
        """No spec limits defined -> yield is None (N/A, NOT default pass)."""
        result = _calc(self.VALUES, total_die_count=self.TOTAL,
                       q1_lower=None, q1_upper=None)
        assert result["q1_yield"] is None

    def test_three_q_levels_independently(self):
        """Q1, Q2, Q3 are computed independently with independent limits."""
        vals = [1.0, 2.0, 3.0, 4.0, 5.0]
        total = 5
        result = _calc(vals, total_die_count=total,
                       q1_lower=1.0, q1_upper=4.0,   # strict: 2,3 -> 2 pass
                       q2_lower=0.0, q2_upper=3.0,   # strict: 1,2 -> 2 pass
                       q3_lower=None, q3_upper=None)  # no spec -> None
        # Q1: values strictly between 1.0 and 4.0 => 2.0, 3.0 => 2
        assert result["q1_yield"] == pytest.approx(2 / 5)
        # Q2: values strictly between 0.0 and 3.0 => 1.0, 2.0 => 2
        assert result["q2_yield"] == pytest.approx(2 / 5)
        # Q3: no spec -> None
        assert result["q3_yield"] is None


# ---------------------------------------------------------------------------
# Section 5: Full synthetic dataset round-trip
# ---------------------------------------------------------------------------

class TestFullSyntheticDataset:
    """
    Build a known synthetic dataset and verify all outputs together.

    Dataset:
      values (bin-1 electrical): [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      total_die_count: 12   (2 additional non-bin-1 dies)
      Q1: lower=2.0, upper=8.0
      Q2: lower=0.0, upper=6.0
      Q3: None (no spec)

    Expected:
      average      = 5.5
      stdev        = np.std([1..10], ddof=1)  ~= 3.02765
      max_val      = 10.0
      min_val      = 1.0
      bin1_yield   = 10/12
      q1_yield     = 5/12  (values 3,4,5,6,7 strictly inside [2,8])
      q2_yield     = 5/12  (values 1,2,3,4,5 -> only 1,2,3,4,5: strict >0 <6: 1,2,3,4,5 -> 5)
      q3_yield     = None  (no spec)
    """
    VALUES = [1.0, 2.0, 3.0, 4.0, 5.0, 6.0, 7.0, 8.0, 9.0, 10.0]
    TOTAL  = 12

    def setup_method(self):
        self.result = _calc(
            self.VALUES, total_die_count=self.TOTAL,
            q1_lower=2.0, q1_upper=8.0,
            q2_lower=0.0, q2_upper=6.0,
            q3_lower=None, q3_upper=None,
        )

    def test_average(self):
        assert self.result["average"] == pytest.approx(5.5)

    def test_stdev(self):
        expected = float(np.std(self.VALUES, ddof=1))
        assert self.result["stdev"] == pytest.approx(expected)

    def test_max_val(self):
        assert self.result["max_val"] == pytest.approx(10.0)

    def test_min_val(self):
        assert self.result["min_val"] == pytest.approx(1.0)

    def test_bin1_yield(self):
        assert self.result["bin1_yield"] == pytest.approx(10 / 12)

    def test_q1_yield_strict(self):
        # Strict (2,8): 3,4,5,6,7 pass -> 5
        assert self.result["q1_yield"] == pytest.approx(5 / 12)

    def test_q2_yield_strict(self):
        # Strict (0,6): 1,2,3,4,5 pass -> 5
        assert self.result["q2_yield"] == pytest.approx(5 / 12)

    def test_q3_yield_no_spec(self):
        assert self.result["q3_yield"] is None


# ---------------------------------------------------------------------------
# Section 6: Integration — real CP data files via parsers
# ---------------------------------------------------------------------------

# Paths relative to the server package root
_REPO_ROOT = os.path.join(os.path.dirname(__file__), "..", "..")
_JJW_FILE  = os.path.join(_REPO_ROOT, "data", "IQC", "extracted",
                           "Microsoft_Excel_Worksheet.xlsx")
_XRW_FILE  = os.path.join(_REPO_ROOT, "data", "IQC", "extracted",
                           "Microsoft_Excel_Worksheet1.xlsx")

_JJW_AVAILABLE = os.path.isfile(_JJW_FILE)
_XRW_AVAILABLE = os.path.isfile(_XRW_FILE)


@pytest.mark.skipif(not _JJW_AVAILABLE, reason="JJW .xlsx test file not found")
class TestJJWFileIntegration:
    """
    Load the real JJW CP data file (25 wafers, 23 params) and verify:
      - Parsers produce valid data structures.
      - calculate_wafer_param_review yields non-zero, plausible results.
      - Strict-inequality Q-yield correctness on params with boundary values.

    The JJW file (Microsoft_Excel_Worksheet.xlsx) contains params where many
    die values sit exactly on a spec boundary:
      - IGS0_5V&Bin3: all 204 values == lower limit 0.0
      - IDS0_24V&Bin4: 71 of 204 values == lower limit 0.0
    """

    @pytest.fixture(scope="class")
    def jjw_parse_result(self):
        from app.services.parser.jjw_parser import JJWParser
        parser = JJWParser()
        return parser.parse(_JJW_FILE)

    def test_parse_produces_expected_wafer_count(self, jjw_parse_result):
        assert len(jjw_parse_result.wafers) == 25

    def test_parse_produces_expected_param_count(self, jjw_parse_result):
        assert len(jjw_parse_result.param_names) == 23

    def test_product_and_lot_id(self, jjw_parse_result):
        assert jjw_parse_result.product_id == "JI30050A"
        assert jjw_parse_result.lot_id == "PD03414"

    def test_vendor_code(self, jjw_parse_result):
        assert jjw_parse_result.vendor_code == "JJW"

    def test_wafer01_gross_die_count(self, jjw_parse_result):
        w01 = next(w for w in jjw_parse_result.wafers if w.wafer_id == "01")
        assert w01.gross_die == 204
        assert w01.bin1_count == 204

    def test_kel_ig_bin1_yield_is_one(self, jjw_parse_result):
        """Wafer 01, KEL_IG&Bin2: all 204 bin-1, yield = 204/204 = 1.0."""
        w01 = next(w for w in jjw_parse_result.wafers if w.wafer_id == "01")
        spec = next(s for s in jjw_parse_result.cp_specs
                    if s.param_name == "KEL_IG&Bin2")
        bin1_dies = [d for d in w01.dies if d.bin == 1]
        vals = [d.electrical["KEL_IG&Bin2"] for d in bin1_dies
                if d.electrical.get("KEL_IG&Bin2") is not None]

        result = _calc(vals, total_die_count=w01.gross_die,
                       q1_lower=spec.lower_limit, q1_upper=spec.upper_limit)

        assert result["bin1_yield"] == pytest.approx(1.0)
        # Values are in [0.005, 0.006], well inside (0.0, 0.1) -> 100% yield
        assert result["q1_yield"] == pytest.approx(1.0)

    def test_igs0_5v_strict_yield_is_zero(self, jjw_parse_result):
        """
        IGS0_5V&Bin3, wafer 01: lower=0.0, upper=10.0.
        ALL 204 measured values are exactly 0.0 (at the lower boundary).
        Strict VBA yield = 0/204 = 0.0 (none pass > 0.0).
        Inclusive yield would be 204/204 = 1.0 — that is the bug.
        """
        w01 = next(w for w in jjw_parse_result.wafers if w.wafer_id == "01")
        spec = next(s for s in jjw_parse_result.cp_specs
                    if s.param_name == "IGS0_5V&Bin3")
        bin1_dies = [d for d in w01.dies if d.bin == 1]
        vals = [d.electrical["IGS0_5V&Bin3"] for d in bin1_dies
                if d.electrical.get("IGS0_5V&Bin3") is not None]

        assert len(vals) == 204
        assert all(v == 0.0 for v in vals), "All values must be 0.0 for this test"
        assert spec.lower_limit == pytest.approx(0.0)

        result = _calc(vals, total_die_count=w01.gross_die,
                       q1_lower=spec.lower_limit, q1_upper=spec.upper_limit)

        assert result["q1_yield"] == pytest.approx(0.0), (
            f"Expected strict q_yield=0.0 (all at boundary), "
            f"got {result['q1_yield']:.4f}. "
            "Inclusive bug would give 1.0."
        )

    def test_ids0_24v_strict_yield_partial(self, jjw_parse_result):
        """
        IDS0_24V&Bin4, wafer 01: lower=0.0, upper=40.0.
        71 of 204 values are exactly 0.0 (at lower boundary) -> fail.
        133 values are > 0.0 and < 40.0 -> pass.
        Strict yield = 133/204.
        Inclusive yield would be 204/204 = 1.0.
        """
        w01 = next(w for w in jjw_parse_result.wafers if w.wafer_id == "01")
        spec = next(s for s in jjw_parse_result.cp_specs
                    if s.param_name == "IDS0_24V&Bin4")
        bin1_dies = [d for d in w01.dies if d.bin == 1]
        vals = [d.electrical["IDS0_24V&Bin4"] for d in bin1_dies
                if d.electrical.get("IDS0_24V&Bin4") is not None]

        arr = np.array(vals)
        at_lower = int(np.sum(arr == 0.0))
        assert at_lower == 71, f"Expected 71 values at lower boundary, got {at_lower}"

        result = _calc(vals, total_die_count=w01.gross_die,
                       q1_lower=spec.lower_limit, q1_upper=spec.upper_limit)

        # 133 values strictly inside (0.0, 40.0)
        assert result["q1_yield"] == pytest.approx(133 / 204), (
            f"Expected strict yield 133/204, got {result['q1_yield']:.6f}. "
            "Inclusive bug would give 1.0."
        )
        assert result["q1_yield"] != pytest.approx(1.0), (
            "Inclusive bug detected: yield should not be 1.0"
        )

    def test_statistics_are_reasonable_for_all_wafers(self, jjw_parse_result):
        """All wafers, all params: statistics should be finite and non-NaN."""
        for wafer in jjw_parse_result.wafers:
            bin1_dies = [d for d in wafer.dies if d.bin == 1]
            for pname in jjw_parse_result.param_names:
                spec = next((s for s in jjw_parse_result.cp_specs
                             if s.param_name == pname), None)
                vals = [d.electrical[pname] for d in bin1_dies
                        if d.electrical.get(pname) is not None]
                if not vals:
                    continue
                result = _calc(
                    vals, total_die_count=wafer.gross_die,
                    q1_lower=spec.lower_limit if spec else None,
                    q1_upper=spec.upper_limit if spec else None,
                )
                for key, val in result.items():
                    # Q yields may legitimately be None (no rule defined).
                    if val is None:
                        continue
                    assert math.isfinite(val), (
                        f"Non-finite result for wafer={wafer.wafer_id}, "
                        f"param={pname}, key={key}: {val}"
                    )
                assert 0.0 <= (result["q1_yield"] or 0.0) <= 1.0
                assert 0.0 <= result["bin1_yield"] <= 1.0


@pytest.mark.skipif(not _XRW_AVAILABLE, reason="XRW .xlsx test file not found")
class TestXRWFileIntegration:
    """
    Load the real XRW CP data file (24 wafers, 19 params) and verify:
      - Parsers produce valid data structures.
      - calculate_wafer_param_review yields plausible results.
      - Statistics match independently computed numpy values.
    """

    @pytest.fixture(scope="class")
    def xrw_parse_result(self):
        from app.services.parser.xrw_parser import XRWParser
        parser = XRWParser()
        return parser.parse(_XRW_FILE)

    def test_parse_produces_expected_wafer_count(self, xrw_parse_result):
        assert len(xrw_parse_result.wafers) == 24

    def test_parse_produces_expected_param_count(self, xrw_parse_result):
        assert len(xrw_parse_result.param_names) == 19

    def test_product_and_lot_id(self, xrw_parse_result):
        assert xrw_parse_result.product_id == "4746"
        assert xrw_parse_result.lot_id == "AME216"

    def test_vendor_code(self, xrw_parse_result):
        assert xrw_parse_result.vendor_code == "XRW"

    def test_wafer01_all_bin1(self, xrw_parse_result):
        w01 = next(w for w in xrw_parse_result.wafers if w.wafer_id == "01")
        assert w01.gross_die == 208
        assert w01.bin1_count == 208

    def test_vth1_250ua_statistics_match_numpy(self, xrw_parse_result):
        """
        VTH1_250UA on wafer 01: compare review_engine output to independently
        computed numpy values. This exercises mean, stdev, min, max, and yield.
        """
        w01 = next(w for w in xrw_parse_result.wafers if w.wafer_id == "01")
        spec = next(s for s in xrw_parse_result.cp_specs
                    if s.param_name == "VTH1_250UA")
        bin1_dies = [d for d in w01.dies if d.bin == 1]
        vals = [d.electrical["VTH1_250UA"] for d in bin1_dies
                if d.electrical.get("VTH1_250UA") is not None]

        arr = np.array(vals, dtype=np.float64)
        result = _calc(vals, total_die_count=w01.gross_die,
                       q1_lower=spec.lower_limit, q1_upper=spec.upper_limit)

        # Statistics must match numpy directly
        assert result["average"] == pytest.approx(float(np.mean(arr)))
        assert result["stdev"]   == pytest.approx(float(np.std(arr, ddof=1)))
        assert result["max_val"] == pytest.approx(float(np.max(arr)))
        assert result["min_val"] == pytest.approx(float(np.min(arr)))

        # Yield: all values well inside (0.8, 1.5) => 1.0
        assert result["q1_yield"] == pytest.approx(1.0)
        assert result["bin1_yield"] == pytest.approx(1.0)

    def test_vth1_250ua_known_statistics(self, xrw_parse_result):
        """
        Cross-check against pre-computed values from manual inspection of the file.
        mean=0.99970673, std=0.01323571, min=0.96700, max=1.03600
        """
        w01 = next(w for w in xrw_parse_result.wafers if w.wafer_id == "01")
        spec = next(s for s in xrw_parse_result.cp_specs
                    if s.param_name == "VTH1_250UA")
        bin1_dies = [d for d in w01.dies if d.bin == 1]
        vals = [d.electrical["VTH1_250UA"] for d in bin1_dies
                if d.electrical.get("VTH1_250UA") is not None]

        result = _calc(vals, total_die_count=w01.gross_die,
                       q1_lower=spec.lower_limit, q1_upper=spec.upper_limit)

        assert result["average"] == pytest.approx(0.99970673, rel=1e-4)
        assert result["stdev"]   == pytest.approx(0.01323571, rel=1e-4)
        assert result["min_val"] == pytest.approx(0.967, rel=1e-4)
        assert result["max_val"] == pytest.approx(1.036, rel=1e-4)
        assert result["bin1_yield"] == pytest.approx(1.0)

    def test_all_wafers_yield_in_range(self, xrw_parse_result):
        """All computed yields must be in [0.0, 1.0]."""
        for wafer in xrw_parse_result.wafers:
            bin1_dies = [d for d in wafer.dies if d.bin == 1]
            for pname in xrw_parse_result.param_names:
                spec = next((s for s in xrw_parse_result.cp_specs
                             if s.param_name == pname), None)
                if spec is None:
                    continue
                vals = [d.electrical[pname] for d in bin1_dies
                        if d.electrical.get(pname) is not None]
                if not vals:
                    continue
                lo = spec.lower_limit
                hi = spec.upper_limit
                # Skip specs with non-numeric limits
                try:
                    lo_f = float(lo) if lo not in (None, "") else None
                    hi_f = float(hi) if hi not in (None, "") else None
                except (TypeError, ValueError):
                    continue

                result = _calc(vals, total_die_count=wafer.gross_die,
                               q1_lower=lo_f, q1_upper=hi_f)
                assert 0.0 <= result["q1_yield"] <= 1.0, (
                    f"Wafer {wafer.wafer_id}, param {pname}: "
                    f"yield out of range: {result['q1_yield']}"
                )
                assert 0.0 <= result["bin1_yield"] <= 1.0

    def test_non_zero_yields_across_wafers(self, xrw_parse_result):
        """
        For VTH1_250UA across all 24 wafers, Q1 yield should be > 0
        (values are well within spec 0.8–1.5).
        """
        spec = next(s for s in xrw_parse_result.cp_specs
                    if s.param_name == "VTH1_250UA")
        for wafer in xrw_parse_result.wafers:
            bin1_dies = [d for d in wafer.dies if d.bin == 1]
            vals = [d.electrical["VTH1_250UA"] for d in bin1_dies
                    if d.electrical.get("VTH1_250UA") is not None]
            if not vals:
                continue
            result = _calc(vals, total_die_count=wafer.gross_die,
                           q1_lower=spec.lower_limit, q1_upper=spec.upper_limit)
            assert result["q1_yield"] > 0.0, (
                f"Wafer {wafer.wafer_id}: VTH1_250UA yield should be non-zero"
            )

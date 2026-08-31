"""Yield thresholds and the human confirmation step.

The cut-offs were the literals 95 and 98, written out in two routers, and
matched neither site: 無錫's own rule is "低于80% HOLD，低于90% WARN，高于90%
PASS", 徐州 judge off Q1-Q3. They are now one configurable pair per site over
Q1 — which works for both because 徐州's Q1 limits are the vendor's own CP
limits, so Q1 yield reproduces the bin yield.
"""

import pytest

from app.services.judgement import classify, PASS, WARN, HOLD

WX_PASS, WX_WARN = 0.90, 0.80


class TestWuxiWrittenRule:
    """無錫 supplied one line of spec: 低于80% HOLD，低于90% WARN，高于90% PASS."""

    @pytest.mark.parametrize("yield_pct,expected", [
        (100.0, PASS),
        (95.0, PASS),
        (90.0, PASS),      # "高于90% PASS" — the boundary passes
        (89.99, WARN),
        (85.0, WARN),
        (80.0, WARN),      # "低于80% HOLD" — 80 itself is not below 80
        (79.99, HOLD),
        (0.0, HOLD),
    ])
    def test_boundaries(self, yield_pct, expected):
        assert classify(yield_pct / 100, WX_PASS, WX_WARN) == expected

    def test_the_old_hardcoded_cutoffs_would_disagree(self):
        """A 96% lot passes for 無錫 and would have been FAIL under the old 95/98."""
        assert classify(0.96, WX_PASS, WX_WARN) == PASS
        # The old code read: <95 FAIL, <98 WARN, else PASS.
        old = "PASS" if 96.0 >= 98 else ("WARN" if 96.0 >= 95 else "FAIL")
        assert old == "WARN"


class TestNoMeasurement:
    def test_none_yield_is_not_a_judgement(self):
        """A lot with nothing to measure is not a failing lot — calling it HOLD
        would raise a quality alarm about missing data."""
        assert classify(None, WX_PASS, WX_WARN) is None


class TestSitesAreIndependent:
    def test_a_site_can_be_stricter_without_moving_the_other(self):
        strict_pass, strict_warn = 0.98, 0.95
        assert classify(0.96, WX_PASS, WX_WARN) == PASS
        assert classify(0.96, strict_pass, strict_warn) == WARN
        assert classify(0.94, strict_pass, strict_warn) == HOLD


class TestEqualThresholds:
    def test_warn_band_can_be_closed(self):
        """PASS == WARN leaves no warning band: a lot is either good or held."""
        assert classify(0.90, 0.90, 0.90) == PASS
        assert classify(0.8999, 0.90, 0.90) == HOLD

"""Box-plot summaries for comparing lots.

議題五 wants past lots pulled up and compared when a yield looks wrong. The box
is what makes a shifted lot visible: 東部高科's three lots all pass at 98.4-98.9%,
so the yield says nothing, while 1ACX02's BVDSS_DEL1 sits a full unit above its
neighbours.
"""

import pytest

from app.services.boxplot import summarise


class TestQuartiles:
    def test_known_set(self):
        s = summarise([1, 2, 3, 4, 5, 6, 7, 8, 9])
        assert s["median"] == 5
        assert s["q1"] == 3
        assert s["q3"] == 7
        assert s["min"] == 1
        assert s["max"] == 9
        assert s["n"] == 9

    def test_mean_and_stdev_are_sample_statistics(self):
        s = summarise([2, 4, 4, 4, 5, 5, 7, 9])
        assert s["mean"] == pytest.approx(5.0)
        # Sample stdev (ddof=1), matching the rest of the engine.
        assert s["stdev"] == pytest.approx(2.13809, rel=1e-4)

    def test_single_value_has_no_spread(self):
        s = summarise([3.5])
        assert s["n"] == 1
        assert s["median"] == s["q1"] == s["q3"] == 3.5
        assert s["stdev"] == 0.0


class TestWhiskersAndOutliers:
    def test_tukey_fences(self):
        """Whiskers reach the furthest point inside 1.5 IQR; 100 is beyond it."""
        s = summarise([1, 2, 3, 4, 5, 6, 7, 8, 9, 100])
        assert s["outlierCount"] == 1
        assert s["outliers"] == [100.0]
        assert s["whiskerHigh"] == 9
        assert s["whiskerLow"] == 1

    def test_no_outliers_leaves_whiskers_at_the_extremes(self):
        s = summarise([10, 11, 12, 13, 14])
        assert s["outlierCount"] == 0
        assert s["whiskerLow"] == 10
        assert s["whiskerHigh"] == 14

    def test_zero_width_iqr_does_not_call_everything_an_outlier(self):
        """A parameter reading the same value on every die — common for a
        leakage current pinned at zero — has no spread and no outliers."""
        s = summarise([0.0] * 50)
        assert s["outlierCount"] == 0
        assert s["whiskerLow"] == 0.0
        assert s["whiskerHigh"] == 0.0

    def test_outliers_are_thinned_but_counted_in_full(self):
        """Thousands of outliers must not be shipped to the browser, and the
        count must still be truthful.

        The bulk has to stay the majority for the extremes to read as outliers
        at all — Tukey fences follow the quartiles, so 500 high values against
        100 low ones makes the low ones the outliers instead.
        """
        values = [50 + (i % 10) for i in range(5000)] + [10_000 + i for i in range(500)]
        s = summarise(values, max_outliers=40)
        assert s["outlierCount"] == 500
        assert len(s["outliers"]) <= 40
        assert min(s["outliers"]) >= 10_000


class TestNothingToSummarise:
    def test_empty(self):
        assert summarise([]) is None

    def test_all_non_finite(self):
        assert summarise([float("nan"), float("inf")]) is None

    def test_drops_non_finite_but_keeps_the_rest(self):
        s = summarise([1.0, float("nan"), 3.0])
        assert s["n"] == 2
        assert s["min"] == 1.0
        assert s["max"] == 3.0


class TestTheShiftItHasToCatch:
    def test_a_shifted_lot_separates_from_its_neighbours(self):
        """Modelled on 東部高科 BVDSS_DEL1: the yields are indistinguishable but
        the middle lot's distribution has moved."""
        normal = summarise([1.5, 1.7, 1.9, 2.1, 2.5] * 20)
        shifted = summarise([2.17, 2.4, 2.71, 3.0, 3.42] * 20)
        assert shifted["median"] > normal["q3"], (
            "a lot whose median clears the neighbouring lot's upper quartile "
            "must be visibly separated on the chart"
        )

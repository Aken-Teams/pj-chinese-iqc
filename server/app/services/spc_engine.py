import numpy as np
from typing import Optional


def calculate_spc(
    wafer_values: list[tuple[str, float]],
) -> dict:
    """
    X-bar control chart calculation.
    wafer_values: list of (wafer_id, x_bar_value)
    Returns control limits and OOC flags.
    """
    if len(wafer_values) < 2:
        return {"dataPoints": [], "grandMean": 0, "ucl": 0, "lcl": 0,
                "sigma2Upper": 0, "sigma2Lower": 0}

    ids = [v[0] for v in wafer_values]
    x_bars = np.array([v[1] for v in wafer_values], dtype=np.float64)

    grand_mean = float(np.mean(x_bars))
    sigma = float(np.std(x_bars, ddof=1))

    ucl = grand_mean + 3 * sigma
    lcl = grand_mean - 3 * sigma
    sigma_2_upper = grand_mean + 2 * sigma
    sigma_2_lower = grand_mean - 2 * sigma

    data_points = []
    for i, (wid, val) in enumerate(wafer_values):
        ooc_reason: Optional[str] = None

        # Rule 1: Beyond control limits (UCL / LCL)
        if val > ucl:
            ooc_reason = "ucl"
        elif val < lcl:
            ooc_reason = "lcl"

        # Rule 2: 7 consecutive points on same side of mean
        if ooc_reason is None and i >= 6:
            window = x_bars[i - 6 : i + 1]
            if all(w > grand_mean for w in window) or all(w < grand_mean for w in window):
                ooc_reason = "run"

        # Rule 3: 6 consecutive points monotonically increasing or decreasing
        if ooc_reason is None and i >= 5:
            window = x_bars[i - 5 : i + 1]
            diffs = np.diff(window)
            if all(d > 0 for d in diffs) or all(d < 0 for d in diffs):
                ooc_reason = "trend"

        data_points.append({
            "waferId": wid,
            "value": float(val),
            "isOoc": ooc_reason is not None,
            "oocReason": ooc_reason,
        })

    return {
        "dataPoints": data_points,
        "grandMean": grand_mean,
        "ucl": ucl,
        "lcl": lcl,
        "sigma2Upper": sigma_2_upper,
        "sigma2Lower": sigma_2_lower,
    }

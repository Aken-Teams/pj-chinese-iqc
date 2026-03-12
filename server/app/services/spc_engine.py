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
        is_ooc = val > ucl or val < lcl

        # Run rule: 7 consecutive same side
        if i >= 6:
            window = x_bars[i - 6 : i + 1]
            if all(w > grand_mean for w in window) or all(w < grand_mean for w in window):
                is_ooc = True

        # Trend rule: 6 consecutive increasing/decreasing
        if i >= 5:
            window = x_bars[i - 5 : i + 1]
            diffs = np.diff(window)
            if all(d > 0 for d in diffs) or all(d < 0 for d in diffs):
                is_ooc = True

        data_points.append({
            "waferId": wid,
            "value": float(val),
            "isOoc": bool(is_ooc),
        })

    return {
        "dataPoints": data_points,
        "grandMean": grand_mean,
        "ucl": ucl,
        "lcl": lcl,
        "sigma2Upper": sigma_2_upper,
        "sigma2Lower": sigma_2_lower,
    }

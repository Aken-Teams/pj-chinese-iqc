"""Five-number summaries for comparing several lots of the same product.

議題五 asks to pull past lots up and compare them when a yield looks wrong. A box
per lot answers that faster than a histogram per lot does: the shift between
lots is the thing being looked for, and boxes line up side by side while
histograms have to be read one at a time.

Quartiles use the linear interpolation numpy defaults to, and whiskers reach the
furthest value still inside 1.5 IQR — the ordinary Tukey convention, so the
picture matches what an engineer expects from any other tool.
"""

from __future__ import annotations

from typing import Optional

import numpy as np


def summarise(values: list[float], max_outliers: int = 40) -> Optional[dict]:
    """Box-plot statistics for one group of measurements.

    None for an empty group: a lot the parameter was never measured on has no
    box, which is different from a lot whose box happens to be flat.
    """
    if not values:
        return None
    arr = np.asarray(values, dtype=np.float64)
    arr = arr[np.isfinite(arr)]
    if arr.size == 0:
        return None

    q1, median, q3 = (float(v) for v in np.percentile(arr, [25, 50, 75]))
    iqr = q3 - q1
    lo_fence, hi_fence = q1 - 1.5 * iqr, q3 + 1.5 * iqr

    inside = arr[(arr >= lo_fence) & (arr <= hi_fence)]
    # A group where every point is an outlier cannot happen with Tukey fences,
    # but a zero-width IQR makes the fences equal to the quartiles, so guard.
    whisker_low = float(inside.min()) if inside.size else float(arr.min())
    whisker_high = float(inside.max()) if inside.size else float(arr.max())

    outliers = arr[(arr < lo_fence) | (arr > hi_fence)]
    # Enough to show the shape of the tail without shipping thousands of points
    # to the browser; the count is reported separately so nothing is hidden.
    if outliers.size > max_outliers:
        step = int(np.ceil(outliers.size / max_outliers))
        shown = outliers[::step]
    else:
        shown = outliers

    return {
        "n": int(arr.size),
        "min": float(arr.min()),
        "max": float(arr.max()),
        "q1": q1,
        "median": median,
        "q3": q3,
        "whiskerLow": whisker_low,
        "whiskerHigh": whisker_high,
        "mean": float(arr.mean()),
        "stdev": float(arr.std(ddof=1)) if arr.size > 1 else 0.0,
        "outliers": [float(v) for v in shown],
        "outlierCount": int(outliers.size),
    }

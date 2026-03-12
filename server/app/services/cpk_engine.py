import numpy as np
from typing import Optional


def calculate_cpk(
    values: list[float],
    usl: Optional[float],
    lsl: Optional[float],
) -> dict:
    """
    Cp  = (USL - LSL) / (6s)
    Cpk = min((USL - X_bar) / (3s), (X_bar - LSL) / (3s))
    """
    if not values or len(values) < 2:
        return {"cp": None, "cpk": None, "mean": 0, "stdev": 0, "usl": usl, "lsl": lsl}

    arr = np.array(values, dtype=np.float64)
    mean = float(np.mean(arr))
    sigma = float(np.std(arr, ddof=1))

    if sigma == 0 or usl is None or lsl is None:
        return {"cp": None, "cpk": None, "mean": mean, "stdev": sigma, "usl": usl, "lsl": lsl}

    cp = (usl - lsl) / (6 * sigma)
    cpu = (usl - mean) / (3 * sigma)
    cpl = (mean - lsl) / (3 * sigma)
    cpk = min(cpu, cpl)

    return {
        "cp": round(cp, 3),
        "cpk": round(cpk, 3),
        "mean": round(mean, 6),
        "stdev": round(sigma, 6),
        "usl": usl,
        "lsl": lsl,
    }

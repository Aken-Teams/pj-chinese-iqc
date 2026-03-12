import numpy as np
from collections import defaultdict
from dataclasses import dataclass
from typing import Optional

from sqlalchemy import text
from sqlalchemy.orm import Session
from app.models.wafer import Wafer
from app.models.die_data import DieData, ElectricalValue
from app.models.review import ReviewResult, ReviewRule
from app.models.spec import CpSpec


@dataclass
class WaferReviewResult:
    wafer_id: str
    wafer_db_id: int
    param_name: str
    average: float
    stdev: float
    max_val: float
    min_val: float
    bin1_yield: float
    q1_yield: float
    q2_yield: float
    q3_yield: float


def calculate_wafer_param_review(
    values: list[float],
    total_die_count: int,
    q1_lower: Optional[float],
    q1_upper: Optional[float],
    q2_lower: Optional[float],
    q2_upper: Optional[float],
    q3_lower: Optional[float],
    q3_upper: Optional[float],
) -> dict:
    """
    Core VBA port: calculate statistics and yields for one param on one wafer.
    Uses STRICT inequalities (> and <) matching VBA COUNTIFS behavior.
    Uses sample stdev (ddof=1) matching VBA STDEV.
    """
    if not values:
        return {
            "average": 0.0, "stdev": 0.0, "max_val": 0.0, "min_val": 0.0,
            "bin1_yield": 0.0, "q1_yield": 0.0, "q2_yield": 0.0, "q3_yield": 0.0,
        }

    arr = np.array(values, dtype=np.float64)
    bin1_count = len(arr)

    avg = float(np.mean(arr))
    stdev = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0
    max_val = float(np.max(arr))
    min_val = float(np.min(arr))

    bin1_yield = bin1_count / total_die_count if total_die_count > 0 else 0.0

    def q_yield(lower: Optional[float], upper: Optional[float]) -> float:
        if lower is None and upper is None:
            return 1.0  # No spec defined = all dies pass by default
        # Inclusive inequalities (>= and <=) for spec limit boundaries
        if lower is not None and upper is not None:
            mask = (arr >= lower) & (arr <= upper)
        elif lower is not None:
            mask = arr >= lower
        else:
            mask = arr <= upper
        count = int(np.sum(mask))
        return count / total_die_count if total_die_count > 0 else 0.0

    return {
        "average": avg,
        "stdev": stdev,
        "max_val": max_val,
        "min_val": min_val,
        "bin1_yield": bin1_yield,
        "q1_yield": q_yield(q1_lower, q1_upper),
        "q2_yield": q_yield(q2_lower, q2_upper),
        "q3_yield": q_yield(q3_lower, q3_upper),
    }


def execute_review(db: Session, lot_id: int, param_names: list[str] | None = None) -> list[WaferReviewResult]:
    """
    Execute review for all wafers in a lot.
    Optimized: loads all data per wafer in one query, then computes in-memory.
    """
    from app.models.lot import Lot

    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        return []

    wafers = db.query(Wafer).filter(Wafer.lot_id == lot_id).all()
    if not wafers:
        return []

    # Get review rules for this product
    rules = {}
    if lot.product_id:
        rule_rows = db.query(ReviewRule).filter(ReviewRule.product_id == lot.product_id).all()
        for r in rule_rows:
            rules[r.param_name] = r

    # Fallback: load cp_specs limits for Q1 when no ReviewRule exists
    cp_spec_map: dict[str, CpSpec] = {}
    spec_rows = db.query(CpSpec).filter(CpSpec.lot_id == lot_id).all()
    for s in spec_rows:
        cp_spec_map[s.param_name] = s

    # Delete old results for this lot's wafers
    wafer_ids = [w.id for w in wafers]
    db.query(ReviewResult).filter(ReviewResult.wafer_id.in_(wafer_ids)).delete(synchronize_session=False)

    results = []
    result_objects = []

    for wafer in wafers:
        total_die_count = wafer.gross_die or 0

        # Load ALL Bin=1 electrical values for this wafer in ONE query
        rows = db.execute(text("""
            SELECT ev.param_name, ev.value
            FROM electrical_values ev
            JOIN die_data dd ON ev.die_id = dd.id
            WHERE dd.wafer_id = :wafer_id AND dd.bin = 1 AND ev.value IS NOT NULL
        """), {"wafer_id": wafer.id}).fetchall()

        # Group values by param
        param_values: dict[str, list[float]] = defaultdict(list)
        for pname, val in rows:
            param_values[pname].append(float(val))

        # If no param_names specified, use all discovered params
        if param_names is None and not results:
            param_names = sorted(param_values.keys())

        for pname in (param_names or []):
            values = param_values.get(pname, [])

            rule = rules.get(pname)
            spec = cp_spec_map.get(pname)

            # Q1 limits: prefer ReviewRule, fallback to cp_specs
            q1_lo = float(rule.q1_lower) if rule and rule.q1_lower is not None else (
                float(spec.lower_limit) if spec and spec.lower_limit is not None else None
            )
            q1_hi = float(rule.q1_upper) if rule and rule.q1_upper is not None else (
                float(spec.upper_limit) if spec and spec.upper_limit is not None else None
            )

            calc = calculate_wafer_param_review(
                values=values,
                total_die_count=total_die_count,
                q1_lower=q1_lo,
                q1_upper=q1_hi,
                q2_lower=float(rule.q2_lower) if rule and rule.q2_lower is not None else None,
                q2_upper=float(rule.q2_upper) if rule and rule.q2_upper is not None else None,
                q3_lower=float(rule.q3_lower) if rule and rule.q3_lower is not None else None,
                q3_upper=float(rule.q3_upper) if rule and rule.q3_upper is not None else None,
            )

            result_objects.append({
                "wafer_id": wafer.id,
                "param_name": pname,
                "average": calc["average"],
                "stdev": calc["stdev"],
                "max_val": calc["max_val"],
                "min_val": calc["min_val"],
                "bin1_yield": calc["bin1_yield"],
                "q1_yield": calc["q1_yield"],
                "q2_yield": calc["q2_yield"],
                "q3_yield": calc["q3_yield"],
            })

            results.append(WaferReviewResult(
                wafer_id=wafer.wafer_id,
                wafer_db_id=wafer.id,
                param_name=pname,
                **calc,
            ))

    # Bulk insert review results
    if result_objects:
        db.execute(ReviewResult.__table__.insert(), result_objects)

    # Update lot status
    lot.status = "reviewed"
    db.commit()

    return results

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
    q1_yield: Optional[float]
    q2_yield: Optional[float]
    q3_yield: Optional[float]


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

    Q yields return None when no rule is defined (both lower and upper are None).
    This is distinct from 0.0 (rule defined but no dies pass).
    """
    def q_yield_empty(lower: Optional[float], upper: Optional[float]) -> Optional[float]:
        # No rule defined → N/A (None), not "pass by default"
        if lower is None and upper is None:
            return None
        return 0.0

    if not values:
        return {
            "average": 0.0, "stdev": 0.0, "max_val": 0.0, "min_val": 0.0,
            "bin1_yield": 0.0,
            "q1_yield": q_yield_empty(q1_lower, q1_upper),
            "q2_yield": q_yield_empty(q2_lower, q2_upper),
            "q3_yield": q_yield_empty(q3_lower, q3_upper),
        }

    arr = np.array(values, dtype=np.float64)
    bin1_count = len(arr)

    avg = float(np.mean(arr))
    stdev = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0
    max_val = float(np.max(arr))
    min_val = float(np.min(arr))

    bin1_yield = bin1_count / total_die_count if total_die_count > 0 else 0.0

    def q_yield(lower: Optional[float], upper: Optional[float]) -> Optional[float]:
        if lower is None and upper is None:
            return None  # No rule defined → N/A, NOT "pass by default"
        # Strict inequalities (> and <) matching VBA COUNTIFS behavior:
        # VBA uses CountIfs(range, ">" & QIL, range, "<" & QIU)
        # A value exactly equal to a limit counts as FAILING.
        if lower is not None and upper is not None:
            mask = (arr > lower) & (arr < upper)
        elif lower is not None:
            mask = arr > lower
        else:
            mask = arr < upper
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


def combined_die_yield(
    die_vectors: dict,
    limits: dict[str, tuple[Optional[float], Optional[float]]],
    total_die_count: int,
) -> Optional[float]:
    """True combined (die-intersection) yield for one Q level on one wafer.

    A die counts only if EVERY parameter that has a limit at this Q level is
    within spec (strict > lower and < upper, matching the per-param VBA rule).
    Denominator is the wafer's total die count, consistent with bin1/per-param
    yields. Returns None when no parameter has a limit at this level (→ N/A),
    matching the per-param "no rule" convention.

    `die_vectors` maps die_id -> {param_name: value} for Bin1 dies only.
    """
    if not limits:
        return None
    if total_die_count <= 0:
        return 0.0
    passing = 0
    for vec in die_vectors.values():
        ok = True
        for pname, (lower, upper) in limits.items():
            v = vec.get(pname)
            # A missing value can't be shown to pass → the die fails this level.
            if v is None:
                ok = False
                break
            if lower is not None and not (v > lower):
                ok = False
                break
            if upper is not None and not (v < upper):
                ok = False
                break
        if ok:
            passing += 1
    return passing / total_die_count


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

        # Load ALL Bin=1 electrical values for this wafer in ONE query. Keep the
        # die id so we can also compute the die-intersection combined yield.
        rows = db.execute(text("""
            SELECT ev.die_id, ev.param_name, ev.value
            FROM electrical_values ev
            JOIN die_data dd ON ev.die_id = dd.id
            WHERE dd.wafer_id = :wafer_id AND dd.bin = 1 AND ev.value IS NOT NULL
        """), {"wafer_id": wafer.id}).fetchall()

        # Group values by param (per-param stats) and by die (combined yield).
        param_values: dict[str, list[float]] = defaultdict(list)
        die_vectors: dict[int, dict[str, float]] = defaultdict(dict)
        for die_id, pname, val in rows:
            fv = float(val)
            param_values[pname].append(fv)
            die_vectors[die_id][pname] = fv

        # Q-level limit maps for the combined yield, filled in the param loop.
        q1_limits: dict[str, tuple] = {}
        q2_limits: dict[str, tuple] = {}
        q3_limits: dict[str, tuple] = {}

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
            # Q2/Q3 come only from ReviewRule (no cp_specs fallback).
            q2_lo = float(rule.q2_lower) if rule and rule.q2_lower is not None else None
            q2_hi = float(rule.q2_upper) if rule and rule.q2_upper is not None else None
            q3_lo = float(rule.q3_lower) if rule and rule.q3_lower is not None else None
            q3_hi = float(rule.q3_upper) if rule and rule.q3_upper is not None else None

            # Collect limits for the wafer-level combined (die-intersection) yield.
            if q1_lo is not None or q1_hi is not None:
                q1_limits[pname] = (q1_lo, q1_hi)
            if q2_lo is not None or q2_hi is not None:
                q2_limits[pname] = (q2_lo, q2_hi)
            if q3_lo is not None or q3_hi is not None:
                q3_limits[pname] = (q3_lo, q3_hi)

            calc = calculate_wafer_param_review(
                values=values,
                total_die_count=total_die_count,
                q1_lower=q1_lo,
                q1_upper=q1_hi,
                q2_lower=q2_lo,
                q2_upper=q2_hi,
                q3_lower=q3_lo,
                q3_upper=q3_hi,
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

        # Store the wafer-level combined (die-intersection) yields.
        wafer.q1_combined = combined_die_yield(die_vectors, q1_limits, total_die_count)
        wafer.q2_combined = combined_die_yield(die_vectors, q2_limits, total_die_count)
        wafer.q3_combined = combined_die_yield(die_vectors, q3_limits, total_die_count)

    # Bulk insert review results
    if result_objects:
        db.execute(ReviewResult.__table__.insert(), result_objects)

    # Update lot status
    lot.status = "reviewed"
    db.commit()

    return results

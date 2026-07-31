from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.dependencies import get_db
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.product import Product
from app.models.vendor import Vendor
from app.models.review import ReviewResult, ReviewRule
from app.models.die_data import DieData, ElectricalValue
from app.schemas.review import (
    ReviewExecuteRequest, LotReviewSummary, WaferReviewRow, WaferDetail, ElectricalParam,
)
from app.services.review_engine import execute_review

router = APIRouter(prefix="/api/review", tags=["review"])


@router.post("/execute")
def run_review(req: ReviewExecuteRequest, db: Session = Depends(get_db)):
    results = execute_review(db, req.lot_id, req.params)
    return {"success": True, "resultCount": len(results)}


@router.get("/results/{lot_id}", response_model=LotReviewSummary)
def get_lot_results(lot_id: int, db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")

    product = db.query(Product).filter(Product.id == lot.product_id).first()
    vendor = db.query(Vendor).filter(Vendor.id == product.vendor_id).first() if product else None

    wafers = db.query(Wafer).filter(Wafer.lot_id == lot_id).order_by(Wafer.wafer_id).all()

    # Source-of-truth for rule availability: query review_rules table directly,
    # NOT inferred from yield values. Q1 also has a cp_specs fallback in the engine.
    has_q1_rules = False
    has_q2_rules = False
    has_q3_rules = False
    if product:
        rule_rows = db.query(ReviewRule).filter(ReviewRule.product_id == product.id).all()
        for r in rule_rows:
            if r.q1_lower is not None or r.q1_upper is not None:
                has_q1_rules = True
            if r.q2_lower is not None or r.q2_upper is not None:
                has_q2_rules = True
            if r.q3_lower is not None or r.q3_upper is not None:
                has_q3_rules = True
        # Q1 can also come from cp_specs fallback
        if not has_q1_rules:
            from app.models.spec import CpSpec
            if db.query(CpSpec).filter(CpSpec.lot_id == lot_id).first():
                has_q1_rules = True

    wafer_rows = []
    total_dies = 0
    yield_sum = 0.0

    def min_or_none(vals: list[float | None]) -> float | None:
        nums = [v for v in vals if v is not None]
        return min(nums) if nums else None

    for w in wafers:
        total_dies += w.gross_die or 0
        bin1_yield_pct = float(w.bin1_yield or 0) * 100

        # Get review results for ALL params. The per-wafer Q figure is the WORST
        # (minimum) electrical item, not the average across params. Averaging
        # mixed rule sets let a stricter Q2 read *higher* than Q1 (see 徐州 bug);
        # the worst-item value is the true compliance bottleneck and stays
        # monotonic (Q2 spec ⊂ Q1 spec ⇒ Q2 ≤ Q1 per item). Per-item yields for
        # pinpointing the drifting parameter are exposed in get_wafer_detail.
        rr_list = db.query(ReviewResult).filter(ReviewResult.wafer_id == w.id).all()
        q1 = min_or_none([float(rr.q1_yield) * 100 if rr.q1_yield is not None else None for rr in rr_list])
        q2 = min_or_none([float(rr.q2_yield) * 100 if rr.q2_yield is not None else None for rr in rr_list])
        q3 = min_or_none([float(rr.q3_yield) * 100 if rr.q3_yield is not None else None for rr in rr_list])

        status = "PASS"
        if bin1_yield_pct < 95:
            status = "FAIL"
        elif bin1_yield_pct < 98:
            status = "WARN"

        yield_sum += bin1_yield_pct
        wafer_rows.append(WaferReviewRow(
            dbId=w.id,
            waferId=w.wafer_id,
            dieCount=w.gross_die or 0,
            bin1Yield=round(bin1_yield_pct, 2),
            q1Yield=round(q1, 2) if q1 is not None else None,
            q2Yield=round(q2, 2) if q2 is not None else None,
            q3Yield=round(q3, 2) if q3 is not None else None,
            status=status,
        ))

    avg_yield = yield_sum / len(wafers) if wafers else 0.0

    def compliance(flag: bool, getter) -> str:
        if not flag:
            return "N/A"
        vals = [getter(w) for w in wafer_rows]
        # If rules are declared but all wafers ended up None, treat as N/A
        nums = [v for v in vals if v is not None]
        if not nums:
            return "N/A"
        return "PASS" if all(v >= 95 for v in nums) else "FAIL"

    q1_compliance = compliance(has_q1_rules, lambda w: w.q1Yield)
    q2_compliance = compliance(has_q2_rules, lambda w: w.q2Yield)

    return LotReviewSummary(
        lotId=lot.lot_id,
        vendor=vendor.code if vendor else "",
        product=product.product_code if product else "",
        waferCount=len(wafers),
        avgYield=round(avg_yield, 2),
        totalDies=total_dies,
        q1Compliance=q1_compliance,
        q2Compliance=q2_compliance,
        wafers=wafer_rows,
    )


@router.get("/results/{lot_id}/wafer/{wafer_id}", response_model=WaferDetail)
def get_wafer_detail(lot_id: int, wafer_id: str, db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")

    wafer = db.query(Wafer).filter(Wafer.lot_id == lot_id, Wafer.wafer_id == wafer_id).first()
    if not wafer:
        raise HTTPException(404, "Wafer not found")

    total = wafer.gross_die or 0
    bin1 = wafer.bin1_count or 0
    yield_pct = float(wafer.bin1_yield or 0) * 100

    # Get review results for all params
    results = db.query(ReviewResult).filter(ReviewResult.wafer_id == wafer.id).all()

    params = []
    for r in results:
        # Check if max is near spec limit (warning)
        max_warning = False  # Could check against cp_specs
        # Per-item yields straight from the engine's per-(wafer, param) result —
        # no cross-parameter aggregation, so a drifting item is visible on its
        # own row. None means "no rule for this Q level" (distinct from 0%).
        params.append(ElectricalParam(
            param=r.param_name,
            avg=f"{float(r.average or 0):.2f}",
            stdev=f"{float(r.stdev or 0):.2f}",
            min=f"{float(r.min_val or 0):.2f}",
            max=f"{float(r.max_val or 0):.2f}",
            maxWarning=max_warning,
            q1Yield=round(float(r.q1_yield) * 100, 2) if r.q1_yield is not None else None,
            q2Yield=round(float(r.q2_yield) * 100, 2) if r.q2_yield is not None else None,
            q3Yield=round(float(r.q3_yield) * 100, 2) if r.q3_yield is not None else None,
        ))

    return WaferDetail(
        waferId=wafer.wafer_id,
        lotId=lot.lot_id,
        totalDies=total,
        bin1Pass=bin1,
        bin1Yield=round(yield_pct, 2),
        failCount=total - bin1,
        electricalParams=params,
    )

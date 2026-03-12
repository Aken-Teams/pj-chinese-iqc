from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.dependencies import get_db
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.product import Product
from app.models.vendor import Vendor
from app.models.review import ReviewResult
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

    wafer_rows = []
    total_dies = 0
    yield_sum = 0.0

    has_q2_rules = False
    for w in wafers:
        total_dies += w.gross_die or 0
        bin1_yield_pct = float(w.bin1_yield or 0) * 100

        # Get review results for ALL params — use average Q yields across params
        rr_list = db.query(ReviewResult).filter(ReviewResult.wafer_id == w.id).all()
        if rr_list:
            q1_vals = [float(rr.q1_yield or 0) * 100 for rr in rr_list]
            q2_vals = [float(rr.q2_yield or 0) * 100 for rr in rr_list]
            q3_vals = [float(rr.q3_yield or 0) * 100 for rr in rr_list]
            q1 = sum(q1_vals) / len(q1_vals)
            q2 = sum(q2_vals) / len(q2_vals)
            q3 = sum(q3_vals) / len(q3_vals)
        else:
            q1 = q2 = q3 = 0.0

        # Check if any Q2 rules actually exist (non-zero Q2 yield means rules were applied)
        if rr_list and any(float(rr.q2_yield or 0) > 0 for rr in rr_list):
            has_q2_rules = True

        status = "PASS"
        if bin1_yield_pct < 95:
            status = "FAIL"
        elif bin1_yield_pct < 98:
            status = "WARN"

        yield_sum += bin1_yield_pct
        wafer_rows.append(WaferReviewRow(
            waferId=w.wafer_id,
            dieCount=w.gross_die or 0,
            bin1Yield=round(bin1_yield_pct, 2),
            q1Yield=round(q1, 2),
            q2Yield=round(q2, 2),
            q3Yield=round(q3, 2),
            status=status,
        ))

    avg_yield = yield_sum / len(wafers) if wafers else 0.0

    # Q1: use cp_specs fallback so real yields exist
    q1_compliance = "PASS" if all(w.q1Yield >= 95 for w in wafer_rows) else "FAIL"
    # Q2: show N/A if no Q2 rules defined
    q2_compliance = ("PASS" if all(w.q2Yield >= 95 for w in wafer_rows) else "FAIL") if has_q2_rules else "N/A"

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
        params.append(ElectricalParam(
            param=r.param_name,
            avg=f"{float(r.average or 0):.2f}",
            stdev=f"{float(r.stdev or 0):.2f}",
            min=f"{float(r.min_val or 0):.2f}",
            max=f"{float(r.max_val or 0):.2f}",
            maxWarning=max_warning,
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

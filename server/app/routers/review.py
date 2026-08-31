from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.dependencies import get_db, get_current_user, assert_lot_visible, can_see_all_domains
from app.models.review import ReviewThreshold
from app.models.user import User
from app.services.judgement import classify, get_thresholds, judge_lot, lot_yield
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.product import Product
from app.models.vendor import Vendor
from app.models.review import ReviewResult, ReviewRule
from app.models.die_data import DieData, ElectricalValue
from app.schemas.review import (
    ReviewExecuteRequest,
    LotReviewSummary,
    WaferReviewRow,
    WaferDetail,
    ElectricalParam,
    ReviewMatrix,
    MatrixWaferRow,
    MatrixCell,
    BatchReviewRequest,
    BatchReviewResponse,
    BatchReviewItem,
    ConfirmJudgementRequest,
    ThresholdResponse,
    ThresholdUpdate,
)
from app.services.review_engine import execute_review

router = APIRouter(prefix="/api/review", tags=["review"])


@router.post("/execute")
def run_review(req: ReviewExecuteRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lot = db.query(Lot).filter(Lot.id == req.lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")
    assert_lot_visible(lot, user)
    results = execute_review(db, req.lot_id, req.params)
    verdict, value = judge_lot(db, lot)
    db.commit()
    return {"success": True, "resultCount": len(results),
            "judgement": verdict, "judgedYield": value}


@router.post("/execute-batch", response_model=BatchReviewResponse)
def run_batch_review(req: BatchReviewRequest, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Run 執行審核 on many lots in one call. Each lot is independent: a failure
    (or a lot outside the caller's site) is recorded and skipped, not fatal."""
    items: list[BatchReviewItem] = []
    reviewed = failed = 0
    for lot_id in req.lot_ids:
        lot = db.query(Lot).filter(Lot.id == lot_id).first()
        if not lot or (not can_see_all_domains(user) and lot.domain != user.domain):
            items.append(BatchReviewItem(lotId=lot_id, success=False, error="not_found"))
            failed += 1
            continue
        try:
            results = execute_review(db, lot_id)
            judge_lot(db, lot)
            db.commit()
            items.append(BatchReviewItem(lotId=lot_id, success=True, resultCount=len(results)))
            reviewed += 1
        except Exception as e:  # noqa: BLE001 — one bad lot must not abort the batch
            db.rollback()
            items.append(BatchReviewItem(lotId=lot_id, success=False, error=str(e)[:200]))
            failed += 1
    return BatchReviewResponse(reviewed=reviewed, failed=failed, results=items)


@router.get("/results/{lot_id}", response_model=LotReviewSummary)
def get_lot_results(lot_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")
    assert_lot_visible(lot, user)

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
    pass_min, warn_min, basis = get_thresholds(db, lot.domain)
    yield_sum = 0.0

    for w in wafers:
        total_dies += w.gross_die or 0
        bin1_yield_pct = float(w.bin1_yield or 0) * 100

        # Per-wafer Q yields = the true combined (die-intersection) yield computed
        # and stored by execute_review: the fraction of dies passing EVERY
        # parameter's limit at that Q level. This is the real wafer Q-level yield,
        # not a cross-parameter average (which produced the impossible "Q2 > Q1").
        # Null until the lot has been (re-)reviewed. Per-parameter yields for
        # pinpointing a drifting parameter are exposed in get_wafer_detail.
        q1 = float(w.q1_combined) * 100 if w.q1_combined is not None else None
        q2 = float(w.q2_combined) * 100 if w.q2_combined is not None else None
        q3 = float(w.q3_combined) * 100 if w.q3_combined is not None else None

        # Per wafer, on the site's own thresholds. Q1 is the basis where it
        # exists — it reproduces the bin yield, and it is the level both sites
        # agreed to judge on — with the bin yield standing in until a lot has
        # been reviewed and has a Q1 to read.
        basis_value = (q1 / 100) if (basis == "q1" and q1 is not None) else (bin1_yield_pct / 100)
        status = classify(basis_value, pass_min, warn_min) or "HOLD"

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
        # Judged on the same cut-off as everything else on this page, rather
        # than a second hardcoded number.
        return "PASS" if all(v >= pass_min * 100 for v in nums) else "FAIL"

    q1_compliance = compliance(has_q1_rules, lambda w: w.q1Yield)
    q2_compliance = compliance(has_q2_rules, lambda w: w.q2Yield)

    # A lot that has not been through 執行審核 has no stored judgement, and the
    # bar would be blank on a page that is already showing a verdict per wafer.
    # Work it out live from whatever yields exist — the same call the review
    # would make — without writing it, so nothing is claimed as reviewed.
    judgement = lot.judgement
    judged_yield = float(lot.judged_yield) if lot.judged_yield is not None else None
    if judgement is None:
        judged_yield = lot_yield(db, lot, basis)
        judgement = classify(judged_yield, pass_min, warn_min)

    confirmed_by = None
    if lot.confirmed_by:
        who = db.query(User).filter(User.id == lot.confirmed_by).first()
        confirmed_by = who.name if who else str(lot.confirmed_by)

    return LotReviewSummary(
        lotId=lot.lot_id,
        vendor=vendor.code if vendor else "",
        product=product.product_code if product else "",
        domain=lot.domain,
        waferCount=len(wafers),
        avgYield=round(avg_yield, 2),
        totalDies=total_dies,
        q1Compliance=q1_compliance,
        q2Compliance=q2_compliance,
        wafers=wafer_rows,
        judgement=judgement,
        judgedYield=judged_yield,
        # False while the lot still needs 執行審核: the verdict above is a live
        # reading, and Q1/Q2 columns stay N/A until the review has run.
        reviewed=(lot.status == "reviewed"),
        passMin=pass_min,
        warnMin=warn_min,
        basis=basis,
        confirmedJudgement=lot.confirmed_judgement,
        confirmedBy=confirmed_by,
        confirmedAt=lot.confirmed_at.isoformat() if lot.confirmed_at else None,
        confirmNote=lot.confirm_note,
    )


@router.get("/results/{lot_id}/wafer/{wafer_id}", response_model=WaferDetail)
def get_wafer_detail(lot_id: int, wafer_id: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")
    assert_lot_visible(lot, user)

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


@router.get("/matrix/{lot_id}", response_model=ReviewMatrix)
def get_review_matrix(lot_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Per-electrical-item yield matrix for a whole lot: one row per wafer, and
    Q1/Q2/Q3 yields for every parameter. No combined yield — this is the 徐州
    layout so a single drifting parameter is pinpointed instead of collapsing
    the whole wafer to one misleading number."""
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")
    assert_lot_visible(lot, user)

    wafers = db.query(Wafer).filter(Wafer.lot_id == lot_id).order_by(Wafer.wafer_id).all()
    wafer_ids = [w.id for w in wafers]

    # One query for all per-(wafer, param) results in the lot, indexed for lookup.
    results = (
        db.query(ReviewResult).filter(ReviewResult.wafer_id.in_(wafer_ids)).all()
        if wafer_ids else []
    )
    by_wafer: dict[int, dict[str, ReviewResult]] = {}
    param_set: set[str] = set()
    for rr in results:
        by_wafer.setdefault(rr.wafer_id, {})[rr.param_name] = rr
        param_set.add(rr.param_name)
    params = sorted(param_set)

    def pct(v):
        return round(float(v) * 100, 2) if v is not None else None

    rows = []
    for w in wafers:
        pmap = by_wafer.get(w.id, {})
        cells = []
        for p in params:
            rr = pmap.get(p)
            cells.append(MatrixCell(
                q1=pct(rr.q1_yield) if rr else None,
                q2=pct(rr.q2_yield) if rr else None,
                q3=pct(rr.q3_yield) if rr else None,
            ))
        rows.append(MatrixWaferRow(
            waferId=w.wafer_id,
            bin1Yield=round(float(w.bin1_yield or 0) * 100, 2),
            cells=cells,
        ))

    return ReviewMatrix(params=params, wafers=rows)


@router.post("/confirm")
def confirm_judgement(
    req: ConfirmJudgementRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Record a person's decision on a lot.

    The system flags; a person decides. The decision is stored separately from
    `judgement` so re-running the review recomputes the suggestion without
    touching what someone signed off. Passing null withdraws a confirmation.
    """
    lot = db.query(Lot).filter(Lot.id == req.lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")
    assert_lot_visible(lot, user)

    if req.judgement is not None and req.judgement not in ("PASS", "WARN", "HOLD"):
        raise HTTPException(400, "judgement must be PASS, WARN, HOLD or null")

    lot.confirmed_judgement = req.judgement
    lot.confirm_note = req.note
    if req.judgement is None:
        lot.confirmed_by = None
        lot.confirmed_at = None
    else:
        lot.confirmed_by = user.id
        lot.confirmed_at = datetime.utcnow()
    db.commit()
    return {
        "success": True,
        "confirmedJudgement": lot.confirmed_judgement,
        "confirmedBy": user.name,
        "confirmedAt": lot.confirmed_at.isoformat() if lot.confirmed_at else None,
    }


@router.get("/thresholds", response_model=list[ThresholdResponse])
def list_thresholds(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """The PASS/WARN cut-offs. A site user sees their own row and the global
    fallback; an admin sees every site's."""
    q = db.query(ReviewThreshold)
    if not can_see_all_domains(user):
        q = q.filter(ReviewThreshold.domain.in_([user.domain, None]))
    return [ThresholdResponse(domain=t.domain, passMin=float(t.pass_min),
                              warnMin=float(t.warn_min), basis=t.basis or "q1")
            for t in q.order_by(ReviewThreshold.domain.is_(None),
                                ReviewThreshold.domain).all()]


@router.put("/thresholds", response_model=ThresholdResponse)
def update_threshold(
    req: ThresholdUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Move one site's cut-offs. Only an admin may edit another site's."""
    domain = req.domain
    if not can_see_all_domains(user) and domain != user.domain:
        raise HTTPException(403, "Cannot edit another site's thresholds")
    if not (0 < req.warnMin <= req.passMin <= 1):
        raise HTTPException(
            400, "Thresholds must satisfy 0 < WARN <= PASS <= 1 (fractions, not percent)")

    row = db.query(ReviewThreshold).filter(ReviewThreshold.domain == domain).first()
    if row is None:
        row = ReviewThreshold(domain=domain)
        db.add(row)
    row.pass_min = req.passMin
    row.warn_min = req.warnMin
    row.basis = req.basis
    row.updated_by = user.id
    row.updated_at = datetime.utcnow()
    db.commit()
    return ThresholdResponse(domain=row.domain, passMin=float(row.pass_min),
                             warnMin=float(row.warn_min), basis=row.basis)

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.ai import AiAnomaly, AiReviewSummary
from app.models.wafer import Wafer
from app.models.lot import Lot
from app.models.review import ReviewResult
from app.models.die_data import DieData
from app.schemas.ai import (
    AnomalyDetectRequest, AnomalyItem,
    ReviewSummaryRequest, ReviewSummaryResponse,
)
from app.services.ai_service import ai_service
from app.services.wafer_map_service import get_wafer_stats, get_bin_distribution

router = APIRouter(prefix="/api/ai", tags=["ai"])


@router.post("/review-summary", response_model=ReviewSummaryResponse)
def generate_summary(req: ReviewSummaryRequest, db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.id == req.lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")

    wafer = None
    if req.wafer_id:
        wafer = db.query(Wafer).filter(Wafer.id == req.wafer_id).first()
    else:
        wafer = db.query(Wafer).filter(Wafer.lot_id == lot.id).first()

    if not wafer:
        raise HTTPException(404, "Wafer not found")

    stats = get_wafer_stats(db, wafer.id)
    bins = get_bin_distribution(db, wafer.id)

    # Get electrical params
    results = db.query(ReviewResult).filter(ReviewResult.wafer_id == wafer.id).all()
    e_params = [
        {"param": r.param_name, "avg": f"{float(r.average or 0):.2f}",
         "stdev": f"{float(r.stdev or 0):.2f}",
         "min": f"{float(r.min_val or 0):.2f}", "max": f"{float(r.max_val or 0):.2f}"}
        for r in results
    ]

    summary_text = ai_service.generate_review_summary(
        wafer_id=wafer.wafer_id,
        lot_id=lot.lot_id,
        stats=stats or {},
        electrical_params=e_params,
        bin_distribution=bins,
        lang=req.lang,
    )

    # Save to DB
    existing = db.query(AiReviewSummary).filter(
        AiReviewSummary.lot_id == lot.id,
        AiReviewSummary.wafer_id == wafer.id,
    ).first()
    if existing:
        existing.summary = summary_text
    else:
        db.add(AiReviewSummary(
            lot_id=lot.id,
            wafer_id=wafer.id,
            summary=summary_text,
            risk_level="low",
            model_version="deepseek-chat",
        ))
    db.commit()

    return ReviewSummaryResponse(summary=summary_text, riskLevel="low")


@router.get("/review-summary/{lot_id}/{wafer_id}", response_model=ReviewSummaryResponse)
def get_summary(lot_id: int, wafer_id: str, db: Session = Depends(get_db)):
    wafer = db.query(Wafer).filter(
        Wafer.lot_id == lot_id, Wafer.wafer_id == wafer_id
    ).first()
    if not wafer:
        raise HTTPException(404, "Wafer not found")

    summary = db.query(AiReviewSummary).filter(
        AiReviewSummary.lot_id == lot_id,
        AiReviewSummary.wafer_id == wafer.id,
    ).first()

    if not summary:
        raise HTTPException(404, "Summary not generated yet")

    return ReviewSummaryResponse(
        summary=summary.summary,
        riskLevel=summary.risk_level,
        keyFindings=summary.key_findings if isinstance(summary.key_findings, list) else None,
    )


@router.get("/anomalies")
def list_anomalies(
    lot_id: int | None = None,
    severity: str = "",
    resolved: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(AiAnomaly)
    if lot_id is not None:
        query = query.filter(AiAnomaly.lot_id == lot_id)
    if severity:
        query = query.filter(AiAnomaly.severity == severity)
    if resolved is not None:
        query = query.filter(AiAnomaly.is_resolved == resolved)

    anomalies = query.order_by(AiAnomaly.detected_at.desc()).limit(20).all()

    return [
        AnomalyItem(
            id=a.id,
            severity=a.severity,
            title=f"{a.anomaly_type}: {a.param_name or 'General'}",
            description=a.description or "",
            confidence=float(a.confidence or 0),
            timestamp=a.detected_at.strftime("%Y-%m-%d %H:%M") if a.detected_at else "",
            paramName=a.param_name,
            isResolved=a.is_resolved or False,
        )
        for a in anomalies
    ]


@router.post("/detect-anomalies")
def detect_anomalies(req: AnomalyDetectRequest, db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.id == req.lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")

    wafer_ids = [w.id for w in db.query(Wafer).filter(Wafer.lot_id == lot.id).all()]
    wafer_count = len(wafer_ids)
    if not wafer_ids:
        return []

    results = db.query(ReviewResult).filter(ReviewResult.wafer_id.in_(wafer_ids)).all()

    # Aggregate stats per param (average across wafers)
    param_buckets: dict[str, list] = {}
    for r in results:
        param_buckets.setdefault(r.param_name, []).append(r)

    params_stats: dict[str, dict] = {}
    for name, rows in param_buckets.items():
        avgs = [float(r.average or 0) for r in rows]
        stdevs = [float(r.stdev or 0) for r in rows]
        mins = [float(r.min_val or 0) for r in rows]
        maxs = [float(r.max_val or 0) for r in rows]
        params_stats[name] = {
            "avg": sum(avgs) / len(avgs),
            "stdev": sum(stdevs) / len(stdevs),
            "min": min(mins),
            "max": max(maxs),
        }

    # Delete existing unresolved anomalies for this lot before writing new ones
    db.query(AiAnomaly).filter(
        AiAnomaly.lot_id == lot.id,
        AiAnomaly.is_resolved == False,  # noqa: E712
    ).delete(synchronize_session=False)

    ai_results = ai_service.detect_anomalies(
        lot_id=lot.lot_id,
        params_stats=params_stats,
        wafer_count=wafer_count,
        lang=req.lang,
    )

    now = datetime.now()
    saved: list[AiAnomaly] = []
    for item in ai_results:
        a = AiAnomaly(
            lot_id=lot.id,
            anomaly_type=str(item.get("anomaly_type", "Unknown"))[:50],
            severity=str(item.get("severity", "warning"))[:20],
            param_name=str(item.get("param_name", ""))[:50] if item.get("param_name") else None,
            confidence=float(item.get("confidence", 0.5)),
            description=str(item.get("description", "")),
            suggestion=str(item.get("suggestion", "")),
            is_resolved=False,
            detected_at=now,
        )
        db.add(a)
        saved.append(a)

    db.commit()
    for a in saved:
        db.refresh(a)

    return [
        AnomalyItem(
            id=a.id,
            severity=a.severity,
            title=f"{a.anomaly_type}" + (f": {a.param_name}" if a.param_name else ""),
            description=a.description or "",
            confidence=float(a.confidence or 0),
            timestamp=a.detected_at.strftime("%Y-%m-%d %H:%M") if a.detected_at else "",
            paramName=a.param_name,
            isResolved=False,
        )
        for a in saved
    ]


@router.patch("/anomalies/{anomaly_id}/resolve")
def resolve_anomaly(anomaly_id: int, db: Session = Depends(get_db)):
    anomaly = db.query(AiAnomaly).filter(AiAnomaly.id == anomaly_id).first()
    if not anomaly:
        raise HTTPException(404, "Anomaly not found")
    anomaly.is_resolved = True
    db.commit()
    return {"success": True}

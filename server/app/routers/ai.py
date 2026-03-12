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
    severity: str = "",
    resolved: bool | None = None,
    db: Session = Depends(get_db),
):
    query = db.query(AiAnomaly)
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


@router.patch("/anomalies/{anomaly_id}/resolve")
def resolve_anomaly(anomaly_id: int, db: Session = Depends(get_db)):
    anomaly = db.query(AiAnomaly).filter(AiAnomaly.id == anomaly_id).first()
    if not anomaly:
        raise HTTPException(404, "Anomaly not found")
    anomaly.is_resolved = True
    db.commit()
    return {"success": True}

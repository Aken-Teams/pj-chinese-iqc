from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db, require_admin
from app.models.ai import AiTokenUsage
from app.models.user import User
from app.schemas.admin import (
    AiUsageBreakdownRow,
    AiUsageDailyRow,
    AiUsageRecord,
    AiUsageSummary,
    AiUsageTotals,
)

# All endpoints require an admin account (require_admin) — this is the
# admin-only console for AI token consumption / billing.
router = APIRouter(
    prefix="/api/admin/ai-usage",
    tags=["admin"],
    dependencies=[Depends(require_admin)],
)


def _est_cost(prompt_tokens: int, completion_tokens: int) -> float:
    cost = (
        prompt_tokens / 1_000_000 * settings.AI_PRICE_INPUT_PER_1M
        + completion_tokens / 1_000_000 * settings.AI_PRICE_OUTPUT_PER_1M
    )
    return round(cost, 4)


@router.get("/summary", response_model=AiUsageSummary)
def usage_summary(
    days: int = Query(30, ge=1, le=365, description="Days of daily trend"),
    db: Session = Depends(get_db),
):
    # All-time totals
    t = db.query(
        func.count(AiTokenUsage.id),
        func.coalesce(func.sum(AiTokenUsage.prompt_tokens), 0),
        func.coalesce(func.sum(AiTokenUsage.completion_tokens), 0),
        func.coalesce(func.sum(AiTokenUsage.total_tokens), 0),
    ).one()
    totals = AiUsageTotals(
        calls=int(t[0] or 0),
        promptTokens=int(t[1] or 0),
        completionTokens=int(t[2] or 0),
        totalTokens=int(t[3] or 0),
        estCost=_est_cost(int(t[1] or 0), int(t[2] or 0)),
        currency=settings.AI_PRICE_CURRENCY,
    )

    def _breakdown(col) -> list[AiUsageBreakdownRow]:
        rows = (
            db.query(
                col,
                func.count(AiTokenUsage.id),
                func.coalesce(func.sum(AiTokenUsage.prompt_tokens), 0),
                func.coalesce(func.sum(AiTokenUsage.completion_tokens), 0),
                func.coalesce(func.sum(AiTokenUsage.total_tokens), 0),
            )
            .group_by(col)
            .order_by(func.sum(AiTokenUsage.total_tokens).desc())
            .all()
        )
        return [
            AiUsageBreakdownRow(
                key=str(r[0] or "unknown"),
                calls=int(r[1] or 0),
                promptTokens=int(r[2] or 0),
                completionTokens=int(r[3] or 0),
                totalTokens=int(r[4] or 0),
                estCost=_est_cost(int(r[2] or 0), int(r[3] or 0)),
            )
            for r in rows
        ]

    # Daily trend for the last `days`
    since = datetime.now() - timedelta(days=days - 1)
    day_col = func.date(AiTokenUsage.created_at)
    daily_rows = (
        db.query(
            day_col,
            func.count(AiTokenUsage.id),
            func.coalesce(func.sum(AiTokenUsage.total_tokens), 0),
        )
        .filter(AiTokenUsage.created_at >= since)
        .group_by(day_col)
        .order_by(day_col)
        .all()
    )
    daily = [
        AiUsageDailyRow(
            date=str(r[0]),
            calls=int(r[1] or 0),
            totalTokens=int(r[2] or 0),
        )
        for r in daily_rows
    ]

    return AiUsageSummary(
        totals=totals,
        byFeature=_breakdown(AiTokenUsage.feature),
        byModel=_breakdown(AiTokenUsage.model),
        daily=daily,
        currency=settings.AI_PRICE_CURRENCY,
    )


@router.get("/recent", response_model=list[AiUsageRecord])
def usage_recent(
    limit: int = Query(50, ge=1, le=500),
    db: Session = Depends(get_db),
):
    rows = (
        db.query(AiTokenUsage, User.name)
        .outerjoin(User, AiTokenUsage.user_id == User.id)
        .order_by(AiTokenUsage.created_at.desc())
        .limit(limit)
        .all()
    )
    return [
        AiUsageRecord(
            id=u.id,
            feature=u.feature,
            model=u.model,
            promptTokens=u.prompt_tokens,
            completionTokens=u.completion_tokens,
            totalTokens=u.total_tokens,
            lang=u.lang,
            userName=name,
            lotId=u.lot_id,
            waferId=u.wafer_id,
            timestamp=u.created_at.strftime("%Y-%m-%d %H:%M") if u.created_at else "",
        )
        for u, name in rows
    ]

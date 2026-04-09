from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.services.dashboard_service import get_dashboard_summary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def dashboard_summary(
    lang: str = "zh-TW",
    period: str = "14d",
    db: Session = Depends(get_db),
):
    return get_dashboard_summary(db, lang, period)

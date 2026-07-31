from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user, can_see_all_domains
from app.models.user import User
from app.services.dashboard_service import get_dashboard_summary

router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


@router.get("/summary")
def dashboard_summary(
    lang: str = "zh-TW",
    period: str = "14d",
    site: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    # Admin may pick a site via `site` ("" = all sites); a site user is locked to
    # their own domain. None scopes to nothing extra (all sites).
    domain = (site or None) if can_see_all_domains(user) else user.domain
    return get_dashboard_summary(db, lang, period, domain=domain)

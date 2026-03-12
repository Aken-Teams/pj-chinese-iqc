from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.wafer import Wafer
from app.services.wafer_map_service import get_wafer_map, get_wafer_stats, get_bin_distribution

router = APIRouter(prefix="/api/wafer-map", tags=["wafer-map"])


@router.get("/{wafer_id}")
def wafer_map(wafer_id: int, db: Session = Depends(get_db)):
    result = get_wafer_map(db, wafer_id)
    if not result:
        raise HTTPException(404, "Wafer not found")
    return result


@router.get("/{wafer_id}/statistics")
def wafer_statistics(wafer_id: int, db: Session = Depends(get_db)):
    result = get_wafer_stats(db, wafer_id)
    if not result:
        raise HTTPException(404, "Wafer not found")
    return result


@router.get("/{wafer_id}/bin-distribution")
def wafer_bin_distribution(wafer_id: int, db: Session = Depends(get_db)):
    return get_bin_distribution(db, wafer_id)

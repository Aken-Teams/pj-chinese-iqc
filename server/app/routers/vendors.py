from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.vendor import Vendor, VendorFormat
from app.schemas.vendor import VendorResponse, VendorFormatCreate

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorResponse])
def list_vendors(db: Session = Depends(get_db)):
    return db.query(Vendor).all()


@router.post("/{vendor_id}/formats")
def create_format(vendor_id: int, req: VendorFormatCreate, db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(404, "Vendor not found")

    fmt = VendorFormat(vendor_id=vendor_id, **req.model_dump())
    db.add(fmt)
    db.commit()
    return {"id": fmt.id}

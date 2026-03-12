from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.vendor import Vendor, VendorFormat
from app.models.product import Product
from app.schemas.vendor import (
    VendorCreate, VendorResponse,
    VendorFormatCreate, VendorFormatUpdate, VendorFormatResponse,
    ProductResponse,
)

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorResponse])
def list_vendors(db: Session = Depends(get_db)):
    return db.query(Vendor).order_by(Vendor.code).all()


@router.post("", response_model=VendorResponse)
def create_vendor(req: VendorCreate, db: Session = Depends(get_db)):
    existing = db.query(Vendor).filter(Vendor.code == req.code.upper()).first()
    if existing:
        raise HTTPException(400, f"Vendor code {req.code} already exists")
    vendor = Vendor(code=req.code.upper(), name=req.name)
    db.add(vendor)
    db.commit()
    db.refresh(vendor)
    return vendor


@router.get("/products", response_model=list[ProductResponse])
def list_products(db: Session = Depends(get_db)):
    products = (
        db.query(Product)
        .join(Vendor, Product.vendor_id == Vendor.id)
        .order_by(Product.product_code)
        .all()
    )
    return [
        ProductResponse(
            id=p.id,
            product_code=p.product_code,
            vendor_id=p.vendor_id,
            vendor_code=p.vendor.code if p.vendor else "",
            vendor_name=p.vendor.name if p.vendor else "",
        )
        for p in products
    ]


@router.get("/{vendor_id}/formats", response_model=list[VendorFormatResponse])
def list_formats(vendor_id: int, db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    return db.query(VendorFormat).filter(VendorFormat.vendor_id == vendor_id).all()


@router.post("/{vendor_id}/formats", response_model=VendorFormatResponse)
def create_format(vendor_id: int, req: VendorFormatCreate, db: Session = Depends(get_db)):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    fmt = VendorFormat(vendor_id=vendor_id, **req.model_dump())
    db.add(fmt)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.put("/{vendor_id}/formats/{fmt_id}", response_model=VendorFormatResponse)
def update_format(vendor_id: int, fmt_id: int, req: VendorFormatUpdate, db: Session = Depends(get_db)):
    fmt = db.query(VendorFormat).filter(
        VendorFormat.id == fmt_id, VendorFormat.vendor_id == vendor_id
    ).first()
    if not fmt:
        raise HTTPException(404, "Format not found")
    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(fmt, field, value)
    db.commit()
    db.refresh(fmt)
    return fmt


@router.delete("/{vendor_id}/formats/{fmt_id}")
def delete_format(vendor_id: int, fmt_id: int, db: Session = Depends(get_db)):
    fmt = db.query(VendorFormat).filter(
        VendorFormat.id == fmt_id, VendorFormat.vendor_id == vendor_id
    ).first()
    if not fmt:
        raise HTTPException(404, "Format not found")
    db.delete(fmt)
    db.commit()
    return {"success": True}

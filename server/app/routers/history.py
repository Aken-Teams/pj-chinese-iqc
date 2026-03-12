import math
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.dependencies import get_db
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.product import Product
from app.models.vendor import Vendor
from app.schemas.history import HistoryResponse, HistoryRow

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/lots", response_model=HistoryResponse)
def list_lots(
    vendor: str = Query("", description="Vendor code filter"),
    product: str = Query("", description="Product code filter"),
    status: str = Query("", description="Status filter"),
    from_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db),
):
    query = db.query(Lot).join(Product, Lot.product_id == Product.id).join(Vendor, Product.vendor_id == Vendor.id)

    if vendor:
        query = query.filter(Vendor.code == vendor)
    if product:
        query = query.filter(Product.product_code == product)
    if status:
        query = query.filter(Lot.status == status.lower())
    if from_date:
        try:
            query = query.filter(Lot.upload_time >= datetime.strptime(from_date, "%Y-%m-%d"))
        except ValueError:
            pass
    if to_date:
        try:
            query = query.filter(Lot.upload_time < datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1))
        except ValueError:
            pass

    total = query.count()
    lots = query.order_by(Lot.upload_time.desc()).offset((page - 1) * page_size).limit(page_size).all()

    items = []
    for lot in lots:
        product_obj = lot.product
        vendor_obj = product_obj.vendor if product_obj else None
        wafer_count = db.query(func.count(Wafer.id)).filter(Wafer.lot_id == lot.id).scalar() or 0
        avg_yield = db.query(func.avg(Wafer.bin1_yield)).filter(Wafer.lot_id == lot.id).scalar()
        avg_yield_pct = float(avg_yield * 100) if avg_yield else 0.0

        lot_status = "PASS"
        if avg_yield_pct < 95:
            lot_status = "FAIL"
        elif avg_yield_pct < 98:
            lot_status = "WARN"

        items.append(HistoryRow(
            id=lot.id,
            productId=lot.product_id or 0,
            date=lot.upload_time.strftime("%Y-%m-%d") if lot.upload_time else "",
            vendor=vendor_obj.code if vendor_obj else "",
            product=product_obj.product_code if product_obj else "",
            lotId=lot.lot_id,
            wafers=wafer_count,
            avgYield=f"{avg_yield_pct:.2f}%",
            status=lot_status,
        ))

    return HistoryResponse(
        items=items,
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=math.ceil(total / page_size) if total > 0 else 0,
    )

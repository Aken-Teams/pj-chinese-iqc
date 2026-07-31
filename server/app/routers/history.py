import math
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func, or_

from app.dependencies import get_db, get_current_user, scope_lots_by_domain, can_see_all_domains
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.product import Product
from app.models.vendor import Vendor
from app.models.user import User
from app.schemas.history import HistoryResponse, HistoryRow

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/lots", response_model=HistoryResponse)
def list_lots(
    vendor: str = Query("", description="Vendor code filter"),
    product: str = Query("", description="Product code filter"),
    status: str = Query("", description="Status filter"),
    search: str = Query("", description="Free-text search over lot / product / vendor"),
    site: str = Query("", description="AD site (廠區) filter — admin only"),
    from_date: Optional[str] = Query(None, description="Start date YYYY-MM-DD"),
    to_date: Optional[str] = Query(None, description="End date YYYY-MM-DD"),
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=1000),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    query = db.query(Lot).join(Product, Lot.product_id == Product.id).join(Vendor, Product.vendor_id == Vendor.id)
    # Site isolation: a site user sees only their own domain; admins see all,
    # optionally narrowed to one site via `site`.
    query = scope_lots_by_domain(query, user)
    if site and can_see_all_domains(user):
        query = query.filter(Lot.domain == site)

    if vendor:
        query = query.filter(Vendor.code == vendor)
    if product:
        query = query.filter(Product.product_code == product)
    if status:
        query = query.filter(Lot.status == status.lower())
    if search:
        # Free-text search so the lot picker can find any lot, not just the
        # first page the client happened to load.
        like = f"%{search.strip()}%"
        query = query.filter(or_(
            Lot.lot_id.ilike(like),
            Lot.mark_lot_id.ilike(like),
            Product.product_code.ilike(like),
            Vendor.code.ilike(like),
            Vendor.name.ilike(like),
        ))
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
    # Eager-load product+vendor so the row loop doesn't lazy-load them per lot.
    lots = (
        query.options(joinedload(Lot.product).joinedload(Product.vendor))
        .order_by(Lot.upload_time.desc())
        .offset((page - 1) * page_size)
        .limit(page_size)
        .all()
    )

    # Wafer count + avg yield for ALL lots in one grouped query (was an N+1 loop
    # of 2 queries per lot — the reason the 500-lot trend fetch felt laggy).
    lot_ids = [lot.id for lot in lots]
    wafer_stats: dict[int, tuple] = {}
    if lot_ids:
        for lid, cnt, avg in (
            db.query(Wafer.lot_id, func.count(Wafer.id), func.avg(Wafer.bin1_yield))
            .filter(Wafer.lot_id.in_(lot_ids))
            .group_by(Wafer.lot_id)
            .all()
        ):
            wafer_stats[lid] = (cnt or 0, avg)

    items = []
    for lot in lots:
        product_obj = lot.product
        vendor_obj = product_obj.vendor if product_obj else None
        wafer_count, avg_yield = wafer_stats.get(lot.id, (0, None))
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
            reviewed=(lot.status == "reviewed"),
            domain=lot.domain,
        ))

    return HistoryResponse(
        items=items,
        total=total,
        page=page,
        pageSize=page_size,
        totalPages=math.ceil(total / page_size) if total > 0 else 0,
    )

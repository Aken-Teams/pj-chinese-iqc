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
from app.services.judgement import classify, get_thresholds

router = APIRouter(prefix="/api", tags=["history"])


@router.get("/lots/filter-options")
def lot_filter_options(
    vendor: str = Query("", description="Narrow products and lots to this vendor"),
    product: str = Query("", description="Narrow lots to this product"),
    site: str = Query("", description="AD site (廠區) filter — admin only"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Options for the 廠商 → 型號 → 批號 filters, each narrowed by the ones above.

    Returned together in one call rather than three: the lists are small, and a
    request per level made the selects flicker as they refilled one after the
    other. Every list is scoped to the caller's site, so a 無錫 user is never
    offered a 徐州 product.
    """
    base = (
        db.query(Lot)
        .join(Product, Lot.product_id == Product.id)
        .join(Vendor, Product.vendor_id == Vendor.id)
    )
    base = scope_lots_by_domain(base, user)
    if site and can_see_all_domains(user):
        base = base.filter(Lot.domain == site)

    vendors = [
        {"code": code, "name": name}
        for code, name in base.with_entities(Vendor.code, Vendor.name)
        .distinct().order_by(Vendor.code).all()
    ]

    by_vendor = base.filter(Vendor.code == vendor) if vendor else base
    products = [
        code for (code,) in by_vendor.with_entities(Product.product_code)
        .distinct().order_by(Product.product_code).all()
    ]

    # A product chosen under a different vendor would silently empty the lot
    # list, so only apply it when it actually belongs to the current vendor.
    by_product = (
        by_vendor.filter(Product.product_code == product)
        if product and product in products else by_vendor
    )
    lots = [
        code for (code,) in by_product.with_entities(Lot.lot_id)
        .distinct().order_by(Lot.lot_id).all() if code
    ]

    present = {
        row[0] for row in by_product.with_entities(
            func.coalesce(Lot.confirmed_judgement, Lot.judgement)).distinct().all()
    }
    judgements = [j for j in ("PASS", "WARN", "HOLD") if j in present]
    if None in present:
        judgements.append("NONE")

    return {"vendors": vendors, "products": products, "lots": lots,
            "judgements": judgements}


@router.get("/lots", response_model=HistoryResponse)
def list_lots(
    vendor: str = Query("", description="Vendor code filter"),
    product: str = Query("", description="Product code filter"),
    lot: str = Query("", description="Exact lot number filter"),
    judgement: str = Query("", description="PASS / WARN / HOLD, or NONE for not yet judged"),
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
    if lot:
        query = query.filter(Lot.lot_id == lot)
    if judgement:
        # A person's decision outranks the computed one, so filter on whichever
        # is in force. Lots that have never been reviewed hold neither, and are
        # reachable through the explicit "NONE".
        in_force = func.coalesce(Lot.confirmed_judgement, Lot.judgement)
        if judgement.upper() == "NONE":
            query = query.filter(in_force.is_(None))
        else:
            query = query.filter(in_force == judgement.upper())
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

    # One lookup per site, not per lot: a 500-lot page would otherwise issue
    # 500 identical threshold queries.
    _threshold_cache: dict = {}

    def thresholds_for(domain):
        if domain not in _threshold_cache:
            _threshold_cache[domain] = get_thresholds(db, domain)
        return _threshold_cache[domain]

    items = []
    for lot in lots:
        product_obj = lot.product
        vendor_obj = product_obj.vendor if product_obj else None
        wafer_count, avg_yield = wafer_stats.get(lot.id, (0, None))
        avg_yield_pct = float(avg_yield * 100) if avg_yield else 0.0

        # A confirmed decision outranks the computed one: the review is
        # advisory and a person has the last word.
        pass_min, warn_min, _basis = thresholds_for(lot.domain)
        lot_status = (lot.confirmed_judgement
                      or lot.judgement
                      or classify(avg_yield_pct / 100, pass_min, warn_min)
                      or "HOLD")

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

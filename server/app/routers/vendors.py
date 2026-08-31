from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user, can_see_all_domains, scope_products_by_domain, scope_formats_by_domain
from app.models.user import User
from app.models.vendor import (
    Vendor, VendorFormat, VendorDomain,
    VendorFormatSample, VendorFormatRevision,
)
from app.models.product import Product
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.analytics import CpkResult as CpkResultModel
from app.models.ai import AiAnomaly
from app.models.vendor_score import VendorScore
from app.schemas.vendor import (
    VendorCreate, VendorResponse,
    VendorFormatCreate, VendorFormatUpdate, VendorFormatResponse,
    ProductResponse,
)

router = APIRouter(prefix="/api/vendors", tags=["vendors"])


@router.get("", response_model=list[VendorResponse])
def list_vendors(site: str = "", db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    """List vendors visible to the caller's site. A vendor with NO site links is
    unassigned and visible to everyone; otherwise a site user sees only vendors
    linked to their domain. Admin sees all (optionally narrowed by `site`)."""
    from collections import defaultdict
    dmap: dict[int, list[str]] = defaultdict(list)
    for vd in db.query(VendorDomain).all():
        dmap[vd.vendor_id].append(vd.domain)

    admin = can_see_all_domains(user)
    out = []
    for v in db.query(Vendor).order_by(Vendor.code).all():
        vdomains = sorted(dmap.get(v.id, []))
        if not admin and user is not None:
            visible = (not vdomains) or (user.domain in vdomains)
            if not visible:
                continue
        elif admin and site:  # admin narrowing to one site
            if site not in vdomains:
                continue
        out.append(VendorResponse(id=v.id, name=v.name, code=v.code, domains=vdomains))
    return out


@router.post("", response_model=VendorResponse)
def create_vendor(req: VendorCreate, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    existing = db.query(Vendor).filter(Vendor.code == req.code.upper()).first()
    if existing:
        raise HTTPException(400, f"Vendor code {req.code} already exists")
    vendor = Vendor(code=req.code.upper(), name=req.name)
    db.add(vendor)
    db.flush()
    # A site user's new vendor belongs to their site; an admin creates an
    # unassigned vendor (visible to all until scoped).
    domains: list[str] = []
    if not can_see_all_domains(user) and user.domain:
        db.add(VendorDomain(vendor_id=vendor.id, domain=user.domain))
        domains = [user.domain]
    db.commit()
    db.refresh(vendor)
    return VendorResponse(id=vendor.id, name=vendor.name, code=vendor.code, domains=domains)


@router.delete("/{vendor_id}")
def delete_vendor(vendor_id: int, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    """Delete a vendor, its site links and its format templates.

    Refused while any lot exists for the vendor: CP data is the record of what
    was actually shipped and reviewed, and removing the vendor would orphan it.
    The counts come back with the refusal so the caller can say what is in the
    way rather than just failing.

    A site user may only delete a vendor their own site can see, and never one
    shared with another site — deleting it there would remove it for everyone.
    """
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(404, "找不到廠商")

    domains = [d.domain for d in
               db.query(VendorDomain).filter(VendorDomain.vendor_id == vendor_id).all()]
    if not can_see_all_domains(user):
        if domains and user.domain not in domains:
            raise HTTPException(404, "找不到廠商")
        others = [d for d in domains if d != user.domain]
        if others:
            raise HTTPException(
                400, "此廠商同時屬於其他廠區（%s），請由管理員處理" % "、".join(others))

    products = db.query(Product).filter(Product.vendor_id == vendor_id).all()
    product_ids = [p.id for p in products]
    lot_count = (db.query(Lot).filter(Lot.product_id.in_(product_ids)).count()
                 if product_ids else 0)
    if lot_count:
        raise HTTPException(
            400,
            "無法刪除：此廠商仍有 %d 筆批次資料（%d 個產品）。"
            "請先在「歷史查詢」刪除相關批次。" % (lot_count, len(products)))

    format_ids = [f.id for f in
                  db.query(VendorFormat).filter(VendorFormat.vendor_id == vendor_id).all()]
    if format_ids:
        # Samples and revisions reference the templates, so they go first.
        db.query(VendorFormatSample).filter(
            VendorFormatSample.vendor_format_id.in_(format_ids)
        ).delete(synchronize_session=False)
        db.query(VendorFormatRevision).filter(
            VendorFormatRevision.vendor_format_id.in_(format_ids)
        ).delete(synchronize_session=False)
        db.query(VendorFormat).filter(
            VendorFormat.vendor_id == vendor_id
        ).delete(synchronize_session=False)

    # Products with no lots carry only rules/specs, which go with the vendor.
    removed_products = 0
    if product_ids:
        from app.models.review import ReviewRule
        from app.models.spec import PackagingSpec
        db.query(ReviewRule).filter(
            ReviewRule.product_id.in_(product_ids)).delete(synchronize_session=False)
        db.query(PackagingSpec).filter(
            PackagingSpec.product_id.in_(product_ids)).delete(synchronize_session=False)
        removed_products = db.query(Product).filter(
            Product.vendor_id == vendor_id).delete(synchronize_session=False)

    db.query(VendorDomain).filter(
        VendorDomain.vendor_id == vendor_id).delete(synchronize_session=False)
    db.delete(vendor)
    db.commit()
    return {"success": True, "deletedFormats": len(format_ids),
            "deletedProducts": removed_products}


@router.get("/products", response_model=list[ProductResponse])
def list_products(site: str = "", db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    q = db.query(Product).join(Vendor, Product.vendor_id == Vendor.id)
    q = scope_products_by_domain(q, user)  # site user -> own; admin -> all
    if site and can_see_all_domains(user):  # admin narrowing to one site
        q = q.filter(Product.domain == site)
    products = q.order_by(Product.product_code).all()
    return [
        ProductResponse(
            id=p.id,
            product_code=p.product_code,
            vendor_id=p.vendor_id,
            vendor_code=p.vendor.code if p.vendor else "",
            vendor_name=p.vendor.name if p.vendor else "",
            domain=p.domain,
        )
        for p in products
    ]


@router.get("/{vendor_id}/formats", response_model=list[VendorFormatResponse])
def list_formats(vendor_id: int, site: str = "", db: Session = Depends(get_db),
                 user: User = Depends(get_current_user)):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    q = db.query(VendorFormat).filter(VendorFormat.vendor_id == vendor_id)
    q = scope_formats_by_domain(q, user)  # site user -> own + unassigned; admin -> all
    if site and can_see_all_domains(user):  # admin narrowing to one site
        q = q.filter(VendorFormat.domain == site)
    return q.all()


@router.post("/{vendor_id}/formats", response_model=VendorFormatResponse)
def create_format(vendor_id: int, req: VendorFormatCreate, site: str = "",
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    vendor = db.query(Vendor).filter(Vendor.id == vendor_id).first()
    if not vendor:
        raise HTTPException(404, "Vendor not found")
    fmt = VendorFormat(vendor_id=vendor_id, **req.model_dump())
    # Tag with the owning site: a site user's template is theirs; an admin sets
    # the target site via `site` (from the page's site filter), else unassigned.
    fmt.domain = (site or None) if can_see_all_domains(user) else user.domain
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


def _score_domain(user: User, site: str = "") -> str | None:
    """Resolve which site scope to score.

    Admins may pick a site via `site` ("" = group-wide/all sites); a regular
    site user is always locked to their own domain regardless of `site`.
    """
    if can_see_all_domains(user):
        return site or None
    return user.domain


def _filter_score_domain(query, domain: str | None):
    if domain is None:
        return query.filter(VendorScore.domain.is_(None))
    return query.filter(VendorScore.domain == domain)


@router.get("/scores")
def list_vendor_scores(period: str = "", site: str = "", db: Session = Depends(get_db),
                       user: User = Depends(get_current_user)):
    """Get vendor scores for a period (YYYY-MM), always freshly computed.

    Scoped to a site: a site user always sees their own; an admin sees the
    group-wide ranking by default, or a specific site via `site`. We recompute
    on every read (a cheap monthly aggregate) rather than serving a cache, so
    scores can never go stale as new lots are reviewed — which previously made
    the group-wide view show fewer vendors than a single site.
    """
    if not period:
        period = datetime.now().strftime("%Y-%m")

    domain = _score_domain(user, site)
    _filter_score_domain(
        db.query(VendorScore).filter(VendorScore.period == period), domain
    ).delete(synchronize_session=False)
    db.commit()
    return _calculate_and_save_scores(period, db, domain)


@router.post("/scores/calculate")
def calculate_vendor_scores(period: str = "", site: str = "", db: Session = Depends(get_db),
                            user: User = Depends(get_current_user)):
    """Recalculate vendor scores for a given period (YYYY-MM), overwriting existing.

    Only the selected site scope is recomputed (admin can target a site via
    `site`, or the group-wide ranking by default), so one site's recalculation
    never wipes another's cached scores.
    """
    if not period:
        period = datetime.now().strftime("%Y-%m")

    domain = _score_domain(user, site)
    # Delete existing scores for this period + site scope
    _filter_score_domain(
        db.query(VendorScore).filter(VendorScore.period == period), domain
    ).delete(synchronize_session=False)
    db.commit()

    return _calculate_and_save_scores(period, db, domain)


def _calculate_and_save_scores(period: str, db: Session, domain: str | None = None) -> list:
    """Core logic: calculate scores per vendor for a period and persist."""
    year, month = period.split("-")
    year_int, month_int = int(year), int(month)

    vendors = db.query(Vendor).all()
    results = []

    for vendor in vendors:
        product_ids = [p.id for p in db.query(Product.id).filter(Product.vendor_id == vendor.id).all()]
        if not product_ids:
            continue

        # Lots in this period (MySQL: YEAR() / MONTH()); scope to the site when
        # a domain is given (None = group-wide / admin, all sites).
        lots_q = db.query(Lot).filter(
            Lot.product_id.in_(product_ids),
            func.year(Lot.upload_time) == year_int,
            func.month(Lot.upload_time) == month_int,
        )
        if domain is not None:
            lots_q = lots_q.filter(Lot.domain == domain)
        lots = lots_q.all()
        if not lots:
            continue

        lot_ids = [lot.id for lot in lots]
        lot_count = len(lots)

        # Average yield from wafers
        wafers = db.query(Wafer).filter(Wafer.lot_id.in_(lot_ids)).all()
        yields = [float(w.bin1_yield) for w in wafers if w.bin1_yield is not None]
        avg_yield = sum(yields) / len(yields) if yields else None

        # Anomaly count (unresolved)
        anomaly_count = (
            db.query(AiAnomaly)
            .filter(AiAnomaly.lot_id.in_(lot_ids), AiAnomaly.is_resolved == False)  # noqa: E712
            .count()
        )

        # Average Cpk from persisted results
        cpk_rows = db.query(CpkResultModel).filter(CpkResultModel.lot_id.in_(lot_ids)).all()
        cpk_vals = [float(c.cpk) for c in cpk_rows if c.cpk is not None]
        cpk_avg = sum(cpk_vals) / len(cpk_vals) if cpk_vals else None

        # Score formula (0-100):
        # yield contributes 50%, cpk 30%, anomaly penalty 20%
        yield_score = (avg_yield * 100 * 0.5) if avg_yield is not None else 0.0
        cpk_score = (min(cpk_avg / 1.33, 1.0) * 100 * 0.3) if cpk_avg is not None else 0.0
        anomaly_ratio = anomaly_count / max(lot_count, 1)
        anomaly_score = max(0.0, 1.0 - anomaly_ratio * 0.5) * 100 * 0.2
        score = round(yield_score + cpk_score + anomaly_score, 2)

        results.append({
            "vendor": vendor,
            "vendorId": vendor.id,
            "vendorName": vendor.name,
            "vendorCode": vendor.code,
            "period": period,
            "avgYield": round(avg_yield, 4) if avg_yield is not None else None,
            "lotCount": lot_count,
            "anomalyCount": anomaly_count,
            "cpkAvg": round(cpk_avg, 3) if cpk_avg is not None else None,
            "score": score,
        })

    # Rank by score descending
    results.sort(key=lambda x: x["score"] or 0, reverse=True)

    now = datetime.now()
    saved = []
    for rank, item in enumerate(results, start=1):
        vs = VendorScore(
            vendor_id=item["vendorId"],
            period=period,
            avg_yield=item["avgYield"],
            lot_count=item["lotCount"],
            anomaly_count=item["anomalyCount"],
            cpk_avg=item["cpkAvg"],
            score=item["score"],
            rank=rank,
            domain=domain,
            calculated_at=now,
        )
        db.add(vs)
        saved.append({
            "vendorId": item["vendorId"],
            "vendorName": item["vendorName"],
            "vendorCode": item["vendorCode"],
            "period": period,
            "avgYield": item["avgYield"],
            "lotCount": item["lotCount"],
            "anomalyCount": item["anomalyCount"],
            "cpkAvg": item["cpkAvg"],
            "score": item["score"],
            "rank": rank,
        })

    db.commit()
    return saved

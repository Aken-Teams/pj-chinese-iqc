from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user, can_see_all_domains
from app.models.user import User
from app.models.vendor import Vendor, VendorFormat
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
    """Get vendor scores for a given period (YYYY-MM). Returns cached if available.

    Scoped to a site: a site user always sees their own; an admin sees the
    group-wide ranking by default, or a specific site via `site`.
    """
    if not period:
        period = datetime.now().strftime("%Y-%m")

    domain = _score_domain(user, site)
    # Return cached scores if they exist
    cached = (
        _filter_score_domain(db.query(VendorScore).filter(VendorScore.period == period), domain)
        .order_by(VendorScore.rank)
        .all()
    )
    if cached:
        vendors = {v.id: v for v in db.query(Vendor).all()}
        return [
            {
                "vendorId": s.vendor_id,
                "vendorName": vendors.get(s.vendor_id, Vendor()).name if s.vendor_id in vendors else "",
                "vendorCode": vendors.get(s.vendor_id, Vendor()).code if s.vendor_id in vendors else "",
                "period": s.period,
                "avgYield": float(s.avg_yield) if s.avg_yield is not None else None,
                "lotCount": s.lot_count,
                "anomalyCount": s.anomaly_count,
                "cpkAvg": float(s.cpk_avg) if s.cpk_avg is not None else None,
                "score": float(s.score) if s.score is not None else None,
                "rank": s.rank,
            }
            for s in cached
        ]

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

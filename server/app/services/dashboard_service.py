from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.vendor import Vendor
from app.models.product import Product
from app.models.review import ReviewResult
from app.models.ai import AiAnomaly


def get_dashboard_summary(db: Session) -> dict:
    """Aggregate data for the dashboard page."""

    # KPIs
    total_lots = db.query(func.count(Lot.id)).scalar() or 0
    reviewed_lots = db.query(func.count(Lot.id)).filter(Lot.status == "reviewed").scalar() or 0

    avg_yield_result = db.query(func.avg(Wafer.bin1_yield)).scalar()
    avg_yield = float(avg_yield_result * 100) if avg_yield_result else 0.0

    vendor_count = db.query(func.count(Vendor.id)).scalar() or 0

    anomaly_count = db.query(func.count(AiAnomaly.id)).filter(
        AiAnomaly.is_resolved == False
    ).scalar() or 0

    kpis = [
        {"labelKey": "kpi.lotsReviewed", "value": f"{reviewed_lots:,}", "delta": "", "deltaType": "neutral"},
        {"labelKey": "kpi.avgYield", "value": f"{avg_yield:.1f}%", "delta": "", "deltaType": "positive"},
        {"labelKey": "kpi.activeVendors", "value": str(vendor_count), "delta": "", "deltaType": "neutral"},
        {"labelKey": "kpi.specAlerts", "value": str(anomaly_count), "delta": "", "deltaType": "negative" if anomaly_count > 0 else "neutral"},
        {"labelKey": "kpi.aiAnomalies", "value": str(anomaly_count), "delta": "", "deltaType": "neutral"},
    ]

    # Vendor performance
    vendor_perf = []
    vendors = db.query(Vendor).all()
    for v in vendors:
        product_ids = [p.id for p in v.products]
        if product_ids:
            lot_ids = [l.id for l in db.query(Lot.id).filter(Lot.product_id.in_(product_ids)).all()]
            if lot_ids:
                wafer_yield = db.query(func.avg(Wafer.bin1_yield)).filter(Wafer.lot_id.in_(lot_ids)).scalar()
                if wafer_yield:
                    vendor_perf.append({"name": f"{v.code} / {v.name}", "yield": round(float(wafer_yield * 100), 2)})

    # Recent lots as activity
    recent_lots = db.query(Lot).order_by(Lot.upload_time.desc()).limit(5).all()
    recent_activity = []
    for lot in recent_lots:
        wafer_count = db.query(func.count(Wafer.id)).filter(Wafer.lot_id == lot.id).scalar() or 0
        product_code = ""
        if lot.product:
            product_code = lot.product.product_code
        recent_activity.append({
            "time": lot.upload_time.strftime("%Y-%m-%d %H:%M") if lot.upload_time else "",
            "action": f"Lot {lot.lot_id} — {wafer_count} wafers ({lot.status})",
            "user": "System",
        })

    return {
        "kpis": kpis,
        "yieldTrend": {"months": [], "vendors": []},
        "vendorPerf": vendor_perf,
        "aiInsights": [],
        "recentActivity": recent_activity,
        "cpkData": [],
    }

from sqlalchemy.orm import Session
from sqlalchemy import func
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.vendor import Vendor
from app.models.product import Product
from app.models.review import ReviewResult
from app.models.spec import CpSpec
from app.models.ai import AiAnomaly
from app.services.cpk_engine import calculate_cpk


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
        {"labelKey": "kpi.lotsReviewed", "value": f"{reviewed_lots:,}", "delta": f"{total_lots} total", "deltaType": "neutral"},
        {"labelKey": "kpi.avgYield", "value": f"{avg_yield:.1f}%", "delta": "", "deltaType": "positive" if avg_yield >= 99 else "neutral"},
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

    vendor_perf.sort(key=lambda x: x["yield"], reverse=True)

    # Recent lots as activity
    recent_lots = db.query(Lot).order_by(Lot.upload_time.desc()).limit(5).all()
    recent_activity = []
    for lot in recent_lots:
        wafer_count = db.query(func.count(Wafer.id)).filter(Wafer.lot_id == lot.id).scalar() or 0
        vendor_name = ""
        if lot.product and lot.product.vendor:
            vendor_name = lot.product.vendor.code
        recent_activity.append({
            "time": lot.upload_time.strftime("%Y-%m-%d %H:%M") if lot.upload_time else "",
            "action": f"Lot {lot.lot_id} — {wafer_count} wafers ({lot.status})",
            "user": vendor_name or "System",
        })

    # Cpk data: compute from latest reviewed lot
    cpk_data = []
    latest_lot = db.query(Lot).filter(Lot.status == "reviewed").order_by(Lot.upload_time.desc()).first()
    if latest_lot:
        cp_specs = db.query(CpSpec).filter(CpSpec.lot_id == latest_lot.id).all()
        spec_map = {s.param_name: s for s in cp_specs}

        wafer_ids = [w.id for w in db.query(Wafer.id).filter(Wafer.lot_id == latest_lot.id).all()]
        if wafer_ids:
            results = db.query(ReviewResult).filter(ReviewResult.wafer_id.in_(wafer_ids)).all()
            param_values: dict[str, list[float]] = {}
            for r in results:
                if r.average is not None:
                    param_values.setdefault(r.param_name, []).append(float(r.average))

            for pname, values in sorted(param_values.items()):
                spec = spec_map.get(pname)
                usl = float(spec.upper_limit) if spec and spec.upper_limit else None
                lsl = float(spec.lower_limit) if spec and spec.lower_limit else None
                result = calculate_cpk(values, usl, lsl)
                if result.get("cpk") is not None:
                    cpk_data.append({"param": pname, "value": round(result["cpk"], 2)})

            cpk_data.sort(key=lambda x: x["value"])
            cpk_data = cpk_data[:8]  # Show top 8 (worst first)

    # Yield trend: group by vendor per month
    yield_trend = {"months": [], "vendors": []}
    # Get lots with data
    lots_with_data = (
        db.query(Lot)
        .filter(Lot.upload_time.isnot(None))
        .order_by(Lot.upload_time)
        .all()
    )
    if lots_with_data:
        from collections import defaultdict
        monthly: dict[str, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
        for lot in lots_with_data:
            month_key = lot.upload_time.strftime("%b")
            vendor_code = lot.product.vendor.code if lot.product and lot.product.vendor else "?"
            avg_y = db.query(func.avg(Wafer.bin1_yield)).filter(Wafer.lot_id == lot.id).scalar()
            if avg_y is not None:
                monthly[month_key][vendor_code].append(float(avg_y * 100))

        months = list(monthly.keys())
        vendor_codes = sorted({vc for m in monthly.values() for vc in m.keys()})
        colors = ["#C05A3C", "#5C4033", "#4A7C59"]

        vendor_series = []
        for idx, vc in enumerate(vendor_codes):
            data_points = []
            for m in months:
                vals = monthly[m].get(vc, [])
                data_points.append(round(sum(vals) / len(vals), 2) if vals else 0)
            vendor_series.append({
                "name": vc,
                "color": colors[idx % len(colors)],
                "data": data_points,
            })

        yield_trend = {"months": months, "vendors": vendor_series}

    return {
        "kpis": kpis,
        "yieldTrend": yield_trend,
        "vendorPerf": vendor_perf,
        "aiInsights": [],
        "recentActivity": recent_activity,
        "cpkData": cpk_data,
    }

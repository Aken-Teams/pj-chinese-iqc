from datetime import date, datetime, timedelta

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

_VENDOR_COLORS = [
    "#C05A3C", "#4A7C59", "#5C4033", "#B58A3C", "#3C6E91", "#8A4F7D",
    "#7A8450", "#A24936", "#2E5E4E", "#8C5E2A", "#5B6B8D", "#9C5C8A",
]


def _color_for_index(i: int) -> str:
    if i < len(_VENDOR_COLORS):
        return _VENDOR_COLORS[i]
    # HSL fallback for many vendors (golden-angle distribution)
    hue = (i * 137) % 360
    return f"hsl({hue}, 55%, 45%)"


def _generate_buckets(period: str) -> tuple[list[datetime], list[datetime], list[str], str]:
    """Return (starts, ends, labels, mode) for the given period.

    starts/ends are datetime ranges [start, end) per bucket.
    mode is 'day' for 14d/30d and 'month' for 6m.
    """
    now = datetime.now()
    today = datetime(now.year, now.month, now.day)

    if period == "6m":
        # 6 monthly buckets ending with current month (inclusive)
        starts: list[datetime] = []
        ends: list[datetime] = []
        labels: list[str] = []
        # Walk back 5 months
        y, m = today.year, today.month
        months_back: list[tuple[int, int]] = []
        for _ in range(6):
            months_back.append((y, m))
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        months_back.reverse()
        for (yy, mm) in months_back:
            start = datetime(yy, mm, 1)
            if mm == 12:
                end = datetime(yy + 1, 1, 1)
            else:
                end = datetime(yy, mm + 1, 1)
            starts.append(start)
            ends.append(end)
            labels.append(f"{yy % 100:02d}/{mm:02d}")
        return starts, ends, labels, "month"

    # Daily buckets: 14d or 30d (default 14d)
    days = 30 if period == "30d" else 14
    starts = []
    ends = []
    labels = []
    for i in range(days - 1, -1, -1):
        day = today - timedelta(days=i)
        starts.append(day)
        ends.append(day + timedelta(days=1))
        labels.append(day.strftime("%m/%d"))
    return starts, ends, labels, "day"


_INSIGHT_T = {
    "zh-TW": {
        "cpk_danger": ("製程能力不足", "參數 {param} 的 Cpk = {cpk:.2f}，低於 1.0，需立即關注"),
        "cpk_warning": ("製程能力警示", "參數 {param} 的 Cpk = {cpk:.2f}，低於 1.33，建議改善"),
        "ai_anomaly": ("AI 偵測異常：{param}", "{description}"),
    },
    "zh-CN": {
        "cpk_danger": ("制程能力不足", "参数 {param} 的 Cpk = {cpk:.2f}，低于 1.0，需立即关注"),
        "cpk_warning": ("制程能力警示", "参数 {param} 的 Cpk = {cpk:.2f}，低于 1.33，建议改善"),
        "ai_anomaly": ("AI 检测异常：{param}", "{description}"),
    },
    "en": {
        "cpk_danger": ("Process Capability Fail", "Param {param} Cpk = {cpk:.2f} < 1.0 — immediate action required"),
        "cpk_warning": ("Capability Warning", "Param {param} Cpk = {cpk:.2f} < 1.33 — improvement recommended"),
        "ai_anomaly": ("AI Anomaly: {param}", "{description}"),
    },
}


def get_dashboard_summary(db: Session, lang: str = "zh-TW", period: str = "14d") -> dict:
    """Aggregate data for the dashboard page."""
    if period not in ("14d", "30d", "6m"):
        period = "14d"

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

    # Yield trend: period-bucketed, fixed slots (None for empty)
    starts, ends, labels, _mode = _generate_buckets(period)
    window_start = starts[0]
    window_end = ends[-1]

    lots_in_window = (
        db.query(Lot)
        .filter(Lot.upload_time.isnot(None))
        .filter(Lot.upload_time >= window_start)
        .filter(Lot.upload_time < window_end)
        .all()
    )

    from collections import defaultdict
    # bucket_index -> vendor_code -> list[float yield%]
    buckets: dict[int, dict[str, list[float]]] = defaultdict(lambda: defaultdict(list))
    vendor_codes_set: set[str] = set()

    for lot in lots_in_window:
        # find bucket index
        idx = None
        for i, (s, e) in enumerate(zip(starts, ends)):
            if s <= lot.upload_time < e:
                idx = i
                break
        if idx is None:
            continue
        vendor_code = lot.product.vendor.code if lot.product and lot.product.vendor else "?"
        avg_y = db.query(func.avg(Wafer.bin1_yield)).filter(Wafer.lot_id == lot.id).scalar()
        if avg_y is not None:
            buckets[idx][vendor_code].append(float(avg_y * 100))
            vendor_codes_set.add(vendor_code)

    vendor_codes = sorted(vendor_codes_set)
    vendor_series = []
    for vi, vc in enumerate(vendor_codes):
        data_points: list[float | None] = []
        for i in range(len(starts)):
            vals = buckets.get(i, {}).get(vc, [])
            if vals:
                data_points.append(round(sum(vals) / len(vals), 2))
            else:
                data_points.append(None)
        vendor_series.append({
            "name": vc,
            "color": _color_for_index(vi),
            "data": data_points,
        })

    yield_trend = {
        "period": period,
        "months": labels,
        "vendors": vendor_series,
    }

    # AI Insights: combine AiAnomaly records + CPK-based rule insights
    tmpl = _INSIGHT_T.get(lang, _INSIGHT_T["zh-TW"])
    ai_insights = []

    # From AiAnomaly table (most recent unresolved)
    anomalies = (
        db.query(AiAnomaly)
        .filter(AiAnomaly.is_resolved == False)
        .order_by(AiAnomaly.detected_at.desc())
        .limit(3)
        .all()
    )
    for a in anomalies:
        title_tpl, desc_tpl = tmpl["ai_anomaly"]
        ai_insights.append({
            "severity": a.severity,
            "title": title_tpl.format(param=a.param_name or ""),
            "description": a.description or desc_tpl.format(description=""),
        })

    # From CPK data (danger: Cpk < 1.0, warning: 1.0 ≤ Cpk < 1.33)
    for item in cpk_data:
        cpk = item["value"]
        if cpk < 1.0:
            title_tpl, desc_tpl = tmpl["cpk_danger"]
            ai_insights.append({
                "severity": "danger",
                "title": title_tpl,
                "description": desc_tpl.format(param=item["param"], cpk=cpk),
            })
        elif cpk < 1.33:
            title_tpl, desc_tpl = tmpl["cpk_warning"]
            ai_insights.append({
                "severity": "warning",
                "title": title_tpl,
                "description": desc_tpl.format(param=item["param"], cpk=cpk),
            })

    # Sort: danger first, then warning, then info; cap at 5
    severity_order = {"danger": 0, "warning": 1, "info": 2}
    ai_insights.sort(key=lambda x: severity_order.get(x["severity"], 9))
    ai_insights = ai_insights[:5]

    return {
        "kpis": kpis,
        "yieldTrend": yield_trend,
        "vendorPerf": vendor_perf,
        "aiInsights": ai_insights,
        "recentActivity": recent_activity,
        "cpkData": cpk_data,
    }

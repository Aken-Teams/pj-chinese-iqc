from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user, assert_lot_visible, scope_lots_by_domain, can_see_all_domains
from app.models.user import User
from app.services.boxplot import summarise
from app.services.cross_lot_ai import summarise_cross_lot
from app.models.wafer import Wafer
from app.models.lot import Lot
from app.models.vendor import Vendor
from app.models.product import Product
from app.models.review import ReviewResult
from app.models.spec import CpSpec
from app.models.die_data import DieData, ElectricalValue
from app.models.analytics import SpcDataPoint, CpkResult as CpkResultModel
from app.services.spc_engine import calculate_spc
from app.services.cpk_engine import calculate_cpk
from app.schemas.analytics import SpcResponse, DistributionResponse, CorrelationResponse

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


def _assert_lot(db: Session, lot_id: int, user: User) -> None:
    """Site users may only touch analytics for lots in their own domain."""
    lot = db.query(Lot).filter(Lot.id == lot_id).first()
    if lot:
        assert_lot_visible(lot, user)


@router.get("/params/{lot_id}")
def get_param_names(lot_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Get distinct parameter names for a lot."""
    _assert_lot(db, lot_id, user)
    wafer_ids = [w.id for w in db.query(Wafer.id).filter(Wafer.lot_id == lot_id).all()]
    if not wafer_ids:
        return []
    params = (
        db.query(ReviewResult.param_name)
        .filter(ReviewResult.wafer_id.in_(wafer_ids))
        .distinct()
        .order_by(ReviewResult.param_name)
        .all()
    )
    return [p[0] for p in params]


@router.get("/spc/{product_id}/{param_name}", response_model=SpcResponse)
def get_spc_chart(product_id: int, param_name: str, site: str = "",
                  lot_id: int | None = Query(None, description="Restrict to one lot"),
                  db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """SPC X-bar control chart for a parameter across wafers.

    `lot_id` narrows this to one lot. 分析 & AI is a single-lot screen: the
    picker at the top chooses a lot, and every chart on the page has to mean the
    same thing by it. Without this, SPC and the correlation matrix silently
    spanned the whole product while the distribution and Cpk honoured the
    choice — one product showed 51 SPC points for a lot holding 25 wafers, with
    nothing on screen to say so. Cross-lot trends belong on 歷史查詢, where the
    range is stated.
    """
    lot_q = scope_lots_by_domain(db.query(Lot.id).filter(Lot.product_id == product_id), user)
    if site and can_see_all_domains(user):  # admin narrowing to one site
        lot_q = lot_q.filter(Lot.domain == site)
    if lot_id is not None:
        lot_q = lot_q.filter(Lot.id == lot_id)
    lot_ids = [l.id for l in lot_q.all()]
    if not lot_ids:
        return SpcResponse(param=param_name, dataPoints=[], grandMean=0, ucl=0, lcl=0, sigma2Upper=0, sigma2Lower=0)

    wafer_ids = [w.id for w in db.query(Wafer.id).filter(Wafer.lot_id.in_(lot_ids)).all()]

    # Count current wafers with this param
    current_count = (
        db.query(ReviewResult.wafer_id)
        .filter(ReviewResult.wafer_id.in_(wafer_ids), ReviewResult.param_name == param_name, ReviewResult.average.isnot(None))
        .distinct()
        .count()
    )

    # Check cache — valid only if row count matches current wafer count
    cached = (
        db.query(SpcDataPoint)
        .filter(SpcDataPoint.wafer_id.in_(wafer_ids), SpcDataPoint.param_name == param_name)
        .order_by(SpcDataPoint.wafer_id)
        .all()
    )
    if len(cached) == current_count and current_count > 0:
        first = cached[0]
        return SpcResponse(
            param=param_name,
            dataPoints=[
                {"waferId": db.query(Wafer.wafer_id).filter(Wafer.id == c.wafer_id).scalar() or str(c.wafer_id),
                 "value": float(c.value or 0),
                 "isOoc": bool(c.is_ooc)}
                for c in cached
            ],
            grandMean=float(first.mean or 0),
            ucl=float(first.ucl or 0),
            lcl=float(first.lcl or 0),
            sigma2Upper=float(first.sigma_2_upper or 0),
            sigma2Lower=float(first.sigma_2_lower or 0),
        )

    results = (
        db.query(ReviewResult)
        .join(Wafer, ReviewResult.wafer_id == Wafer.id)
        .filter(Wafer.lot_id.in_(lot_ids), ReviewResult.param_name == param_name)
        .order_by(Wafer.id)
        .all()
    )

    wafer_map: dict[int, str] = {}
    wafer_values = []
    for r in results:
        wafer = db.query(Wafer).filter(Wafer.id == r.wafer_id).first()
        if wafer and r.average is not None:
            wafer_map[wafer.id] = wafer.wafer_id
            wafer_values.append((wafer.wafer_id, float(r.average)))

    spc = calculate_spc(wafer_values)
    spc["param"] = param_name

    # Persist: delete stale rows then insert fresh
    if cached:
        db.query(SpcDataPoint).filter(
            SpcDataPoint.wafer_id.in_(wafer_ids), SpcDataPoint.param_name == param_name
        ).delete(synchronize_session=False)

    now = datetime.now()
    wafer_id_to_db: dict[str, int] = {v: k for k, v in wafer_map.items()}
    for dp in spc["dataPoints"]:
        db_wafer_id = wafer_id_to_db.get(dp["waferId"])
        if db_wafer_id:
            db.add(SpcDataPoint(
                wafer_id=db_wafer_id,
                param_name=param_name,
                value=dp["value"],
                ucl=spc["ucl"],
                lcl=spc["lcl"],
                mean=spc["grandMean"],
                sigma_2_upper=spc["sigma2Upper"],
                sigma_2_lower=spc["sigma2Lower"],
                is_ooc=dp["isOoc"],
                recorded_at=now,
            ))
    db.commit()

    return spc


@router.get("/cpk/{lot_id}")
def get_cpk(lot_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Cp/Cpk for all params in a lot."""
    _assert_lot(db, lot_id, user)
    # Check cache
    cached = db.query(CpkResultModel).filter(CpkResultModel.lot_id == lot_id).all()
    if cached:
        return [
            {
                "param": c.param_name,
                "cp": float(c.cp) if c.cp is not None else None,
                "cpk": float(c.cpk) if c.cpk is not None else None,
                "mean": float(c.mean) if c.mean is not None else 0,
                "stdev": float(c.stdev) if c.stdev is not None else 0,
                "usl": float(c.usl) if c.usl is not None else None,
                "lsl": float(c.lsl) if c.lsl is not None else None,
            }
            for c in cached
        ]

    cp_specs = db.query(CpSpec).filter(CpSpec.lot_id == lot_id).all()
    spec_map = {s.param_name: s for s in cp_specs}

    wafers = db.query(Wafer).filter(Wafer.lot_id == lot_id).all()
    wafer_ids = [w.id for w in wafers]

    results = db.query(ReviewResult).filter(ReviewResult.wafer_id.in_(wafer_ids)).all()

    # Group values by param
    param_values: dict[str, list[float]] = {}
    for r in results:
        if r.average is not None:
            param_values.setdefault(r.param_name, []).append(float(r.average))

    cpk_results = []
    now = datetime.now()
    for pname, values in param_values.items():
        spec = spec_map.get(pname)
        usl = float(spec.upper_limit) if spec and spec.upper_limit else None
        lsl = float(spec.lower_limit) if spec and spec.lower_limit else None
        result = calculate_cpk(values, usl, lsl)
        result["param"] = pname
        cpk_results.append(result)

        db.add(CpkResultModel(
            lot_id=lot_id,
            param_name=pname,
            cp=result.get("cp"),
            cpk=result.get("cpk"),
            mean=result.get("mean"),
            stdev=result.get("stdev"),
            usl=usl,
            lsl=lsl,
            calculated_at=now,
        ))

    db.commit()
    return cpk_results


@router.get("/distribution/{lot_id}/{param_name}", response_model=DistributionResponse)
def get_distribution(lot_id: int, param_name: str, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Distribution histogram for a parameter."""
    import numpy as np
    _assert_lot(db, lot_id, user)

    wafers = db.query(Wafer).filter(Wafer.lot_id == lot_id).all()
    wafer_ids = [w.id for w in wafers]

    results = (
        db.query(ReviewResult)
        .filter(ReviewResult.wafer_id.in_(wafer_ids), ReviewResult.param_name == param_name)
        .all()
    )

    values = [float(r.average) for r in results if r.average is not None]

    if not values:
        return DistributionResponse(param=param_name, mean=0, stdev=0, cpk=None, bins=[], counts=[])

    arr = np.array(values)
    mean = float(np.mean(arr))
    stdev = float(np.std(arr, ddof=1)) if len(arr) > 1 else 0.0

    counts_arr, bin_edges = np.histogram(arr, bins=10)
    bins_list = [float(b) for b in bin_edges]
    counts_list = [int(c) for c in counts_arr]

    # Get Cpk
    spec = db.query(CpSpec).filter(CpSpec.lot_id == lot_id, CpSpec.param_name == param_name).first()
    cpk_val = None
    if spec and spec.upper_limit and spec.lower_limit and stdev > 0:
        usl = float(spec.upper_limit)
        lsl = float(spec.lower_limit)
        cpk_result = calculate_cpk(values, usl, lsl)
        cpk_val = cpk_result.get("cpk")

    return DistributionResponse(
        param=param_name,
        mean=round(mean, 6),
        stdev=round(stdev, 6),
        cpk=cpk_val,
        bins=bins_list,
        counts=counts_list,
    )


@router.get("/correlation/{product_id}", response_model=CorrelationResponse)
def get_correlation(product_id: int, site: str = "",
                    lot_id: int | None = Query(None, description="Restrict to one lot"),
                    db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    """Parameter correlation matrix.

    `lot_id` narrows this to one lot. 分析 & AI is a single-lot screen: the
    picker at the top chooses a lot, and every chart on the page has to mean the
    same thing by it. Without this, SPC and the correlation matrix silently
    spanned the whole product while the distribution and Cpk honoured the
    choice — one product showed 51 SPC points for a lot holding 25 wafers, with
    nothing on screen to say so. Cross-lot trends belong on 歷史查詢, where the
    range is stated.
    """
    import numpy as np

    lot_q = scope_lots_by_domain(db.query(Lot.id).filter(Lot.product_id == product_id), user)
    if site and can_see_all_domains(user):  # admin narrowing to one site
        lot_q = lot_q.filter(Lot.domain == site)
    if lot_id is not None:
        lot_q = lot_q.filter(Lot.id == lot_id)
    lot_ids = [l.id for l in lot_q.all()]
    if not lot_ids:
        return CorrelationResponse(params=[], matrix=[])

    wafer_ids = [w.id for w in db.query(Wafer.id).filter(Wafer.lot_id.in_(lot_ids)).all()]
    if not wafer_ids:
        return CorrelationResponse(params=[], matrix=[])

    results = (
        db.query(ReviewResult)
        .filter(ReviewResult.wafer_id.in_(wafer_ids))
        .all()
    )

    # Group by param
    param_data: dict[str, list[float]] = {}
    for r in results:
        if r.average is not None:
            param_data.setdefault(r.param_name, []).append(float(r.average))

    params = sorted(param_data.keys())
    if len(params) < 2:
        return CorrelationResponse(params=params, matrix=[[1.0]])

    # Build matrix
    n = len(params)
    matrix = [[0.0] * n for _ in range(n)]
    for i in range(n):
        for j in range(n):
            if i == j:
                matrix[i][j] = 1.0
            elif j > i:
                a = np.array(param_data[params[i]])
                b = np.array(param_data[params[j]])
                min_len = min(len(a), len(b))
                if min_len >= 2 and np.std(a[:min_len]) > 0 and np.std(b[:min_len]) > 0:
                    corr = float(np.corrcoef(a[:min_len], b[:min_len])[0, 1])
                    if not np.isnan(corr):
                        matrix[i][j] = round(corr, 4)
                        matrix[j][i] = round(corr, 4)

    return CorrelationResponse(params=params, matrix=matrix)


@router.get("/cross-lot/lots")
def cross_lot_candidates(
    vendor: str = Query("", description="Vendor code filter"),
    product: str = Query("", description="Product code filter"),
    from_date: str = Query("", description="YYYY-MM-DD, on the test date"),
    to_date: str = Query(""),
    site: str = Query(""),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Lots that could be compared, for the caller to choose from.

    議題五 asks to pick the files to compare, so the lots are listed and the
    choosing is left to the user. Grouping by product and handing back every lot
    it holds would decide that for them, and would rule out the comparison they
    are most likely to want next — the same parameter across two sibling
    products from one fab.
    """
    when = func.coalesce(Lot.test_date, Lot.upload_time)
    q = (db.query(Lot, Product, Vendor)
         .join(Product, Product.id == Lot.product_id)
         .outerjoin(Vendor, Vendor.id == Product.vendor_id))
    q = scope_lots_by_domain(q, user)
    if site and can_see_all_domains(user):
        q = q.filter(Lot.domain == site)
    if vendor:
        q = q.filter(Vendor.code == vendor)
    if product:
        q = q.filter(Product.product_code == product)
    if from_date:
        try:
            q = q.filter(when >= datetime.strptime(from_date, "%Y-%m-%d"))
        except ValueError:
            pass
    if to_date:
        try:
            q = q.filter(when < datetime.strptime(to_date, "%Y-%m-%d") + timedelta(days=1))
        except ValueError:
            pass

    rows = q.order_by(when.desc(), Lot.id.desc()).limit(300).all()
    wafer_counts = dict(
        db.query(Wafer.lot_id, func.count(Wafer.id))
        .filter(Wafer.lot_id.in_([l.id for l, _p, _v in rows]))
        .group_by(Wafer.lot_id).all()
    ) if rows else {}

    return [{
        "lotId": lot.id,
        "lot": lot.lot_id,
        "product": p.product_code,
        "vendor": v.code if v else None,
        "date": (lot.test_date or lot.upload_time).isoformat()
                if (lot.test_date or lot.upload_time) else None,
        "dateIsTestDate": lot.test_date is not None,
        "waferCount": wafer_counts.get(lot.id, 0),
        "judgement": lot.confirmed_judgement or lot.judgement,
    } for lot, p, v in rows]


@router.get("/cross-lot")
def cross_lot_analysis(
    lot_ids: str = Query("", description="Comma-separated lot ids to compare"),
    param_name: str = Query("", description="Parameter for the box plots"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Yield trend and per-lot distributions for the chosen lots.

    Both views come from one call because they answer the same question from two
    sides: the trend says which lot moved, the boxes say how. Splitting them
    would give the two charts two chances to disagree about which lots are in
    scope — the mistake 分析 & AI was already making.

    The time axis is the test date, falling back to the upload time where a file
    carries no stamp. 無錫's entire history was imported in one sitting, so
    upload time alone puts every lot on the same day.
    """
    try:
        ids = [int(x) for x in lot_ids.split(",") if x.strip()]
    except ValueError:
        raise HTTPException(400, "lot_ids must be a comma-separated list of numbers")
    if not ids:
        return {"paramName": param_name, "params": [], "trend": [], "boxes": [],
                "products": []}

    when = func.coalesce(Lot.test_date, Lot.upload_time)
    lot_q = scope_lots_by_domain(db.query(Lot).filter(Lot.id.in_(ids)), user)
    lots = lot_q.order_by(when, Lot.id).all()
    if not lots:
        return {"paramName": param_name, "params": [], "trend": [], "boxes": [],
                "products": []}

    lot_ids_seen = [l.id for l in lots]
    products = {
        p.id: (p, v) for p, v in db.query(Product, Vendor)
        .outerjoin(Vendor, Vendor.id == Product.vendor_id)
        .filter(Product.id.in_([l.product_id for l in lots])).all()
    }
    wafers = db.query(Wafer).filter(Wafer.lot_id.in_(lot_ids_seen)).all()
    by_lot: dict[int, list] = {}
    for w in wafers:
        by_lot.setdefault(w.lot_id, []).append(w)

    def describe(lot):
        p, v = products.get(lot.product_id, (None, None))
        return (v.code if v else None), (p.product_code if p else None)

    trend = []
    for lot in lots:
        ws = by_lot.get(lot.id, [])
        yields = [float(w.bin1_yield) for w in ws if w.bin1_yield is not None]
        q1s = [float(w.q1_combined) for w in ws if w.q1_combined is not None]
        stamp = lot.test_date or lot.upload_time
        vendor_code, product_code = describe(lot)
        trend.append({
            "lotId": lot.id,
            "lot": lot.lot_id,
            "vendor": vendor_code,
            "product": product_code,
            "date": stamp.isoformat() if stamp else None,
            # Says whether the point sits on a real test date or on the day the
            # file happened to be uploaded — a trend built on the latter is not
            # a trend, and the reader should be able to tell.
            "dateIsTestDate": lot.test_date is not None,
            "waferCount": len(ws),
            "bin1Yield": round(sum(yields) / len(yields) * 100, 2) if yields else None,
            "q1Yield": round(sum(q1s) / len(q1s) * 100, 2) if q1s else None,
            "judgement": lot.confirmed_judgement or lot.judgement,
        })

    params = [r[0] for r in db.query(CpSpec.param_name)
              .filter(CpSpec.lot_id.in_(lot_ids_seen)).distinct()
              .order_by(CpSpec.param_name).all()]

    boxes = []
    if param_name:
        for lot in lots:
            ws = by_lot.get(lot.id, [])
            if not ws:
                continue
            values = [
                float(v) for (v,) in db.query(ElectricalValue.value)
                .join(DieData, DieData.id == ElectricalValue.die_id)
                .filter(DieData.wafer_id.in_([w.id for w in ws]),
                        DieData.bin == 1,
                        ElectricalValue.param_name == param_name,
                        ElectricalValue.value.isnot(None))
                .all()
            ]
            stats = summarise(values)
            if stats is None:
                continue
            spec = (db.query(CpSpec)
                    .filter(CpSpec.lot_id == lot.id, CpSpec.param_name == param_name)
                    .first())
            stamp = lot.test_date or lot.upload_time
            vendor_code, product_code = describe(lot)
            boxes.append({
                "lotId": lot.id, "lot": lot.lot_id,
                "vendor": vendor_code, "product": product_code,
                "date": stamp.isoformat() if stamp else None,
                "lower": float(spec.lower_limit) if spec and spec.lower_limit is not None else None,
                "upper": float(spec.upper_limit) if spec and spec.upper_limit is not None else None,
                "unit": spec.unit if spec else None,
                **stats,
            })

    # The control chart 議題四 asked for: one point per wafer in test order, with
    # the limits derived from the data rather than from a yield threshold. The
    # rules it flags — beyond 3σ, seven points one side of the mean, six points
    # trending — are the ones on the requirement's own legend, and the engine
    # already implemented them for the single-product chart.
    spc = None
    if param_name:
        wafer_order = []
        for lot in lots:
            for w in sorted(by_lot.get(lot.id, []), key=lambda x: (x.wafer_id or "", x.id)):
                wafer_order.append((lot, w))
        means = dict(
            db.query(DieData.wafer_id, func.avg(ElectricalValue.value))
            .join(ElectricalValue, ElectricalValue.die_id == DieData.id)
            .filter(DieData.wafer_id.in_([w.id for _l, w in wafer_order]),
                    DieData.bin == 1,
                    ElectricalValue.param_name == param_name,
                    ElectricalValue.value.isnot(None))
            .group_by(DieData.wafer_id).all()
        ) if wafer_order else {}

        series, labels = [], []
        for lot, w in wafer_order:
            value = means.get(w.id)
            if value is None:
                continue
            key = "%s#%s" % (lot.lot_id, w.wafer_id)
            series.append((key, float(value)))
            stamp = lot.test_date or lot.upload_time
            labels.append({
                "key": key, "lot": lot.lot_id, "wafer": w.wafer_id,
                "date": stamp.isoformat() if stamp else None,
            })
        if len(series) >= 2:
            spc = calculate_spc(series)
            spc["labels"] = labels

    return {
        "paramName": param_name,
        "params": params,
        # Named so the page can warn when lots of different products are being
        # compared: their yields are not on the same footing.
        "products": sorted({pc for _v, pc in (describe(l) for l in lots) if pc}),
        "trend": trend,
        "boxes": boxes,
        "spc": spc,
    }


@router.post("/cross-lot/summary")
def cross_lot_summary(
    lot_ids: str = Query("", description="Comma-separated lot ids"),
    param_name: str = Query("", description="Parameter the boxes and chart cover"),
    lang: str = Query("zh-TW"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Have the on-premise model read the comparison already on screen.

    Built from the same call the page renders, so the summary can never describe
    a different set of lots than the charts beside it.
    """
    payload = cross_lot_analysis(lot_ids=lot_ids, param_name=param_name,
                                 db=db, user=user)
    if not payload.get("trend"):
        raise HTTPException(400, "No lots to summarise")
    try:
        text, model = summarise_cross_lot(payload, param_name, lang)
    except RuntimeError as exc:
        raise HTTPException(503, str(exc))
    except Exception as exc:  # noqa: BLE001 — the gateway is external
        raise HTTPException(502, "LLM request failed: %s" % str(exc)[:200])
    return {"summary": text, "model": model,
            "lotCount": len(payload["trend"]), "paramName": param_name}

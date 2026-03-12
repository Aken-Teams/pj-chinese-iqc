from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.wafer import Wafer
from app.models.lot import Lot
from app.models.review import ReviewResult
from app.models.spec import CpSpec
from app.models.die_data import DieData, ElectricalValue
from app.services.spc_engine import calculate_spc
from app.services.cpk_engine import calculate_cpk
from app.schemas.analytics import SpcResponse, DistributionResponse, CorrelationResponse

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/params/{lot_id}")
def get_param_names(lot_id: int, db: Session = Depends(get_db)):
    """Get distinct parameter names for a lot."""
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
def get_spc_chart(product_id: int, param_name: str, db: Session = Depends(get_db)):
    """SPC X-bar control chart for a parameter across wafers."""
    lot_ids = [l.id for l in db.query(Lot.id).filter(Lot.product_id == product_id).all()]
    if not lot_ids:
        return SpcResponse(param=param_name, dataPoints=[], grandMean=0, ucl=0, lcl=0, sigma2Upper=0, sigma2Lower=0)

    results = (
        db.query(ReviewResult)
        .join(Wafer, ReviewResult.wafer_id == Wafer.id)
        .filter(Wafer.lot_id.in_(lot_ids), ReviewResult.param_name == param_name)
        .order_by(Wafer.id)
        .all()
    )

    wafer_values = []
    for r in results:
        wafer = db.query(Wafer).filter(Wafer.id == r.wafer_id).first()
        if wafer and r.average is not None:
            wafer_values.append((wafer.wafer_id, float(r.average)))

    spc = calculate_spc(wafer_values)
    spc["param"] = param_name
    return spc


@router.get("/cpk/{lot_id}")
def get_cpk(lot_id: int, db: Session = Depends(get_db)):
    """Cp/Cpk for all params in a lot."""
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
    for pname, values in param_values.items():
        spec = spec_map.get(pname)
        usl = float(spec.upper_limit) if spec and spec.upper_limit else None
        lsl = float(spec.lower_limit) if spec and spec.lower_limit else None
        result = calculate_cpk(values, usl, lsl)
        result["param"] = pname
        cpk_results.append(result)

    return cpk_results


@router.get("/distribution/{lot_id}/{param_name}", response_model=DistributionResponse)
def get_distribution(lot_id: int, param_name: str, db: Session = Depends(get_db)):
    """Distribution histogram for a parameter."""
    import numpy as np

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
def get_correlation(product_id: int, db: Session = Depends(get_db)):
    """Parameter correlation matrix."""
    import numpy as np

    lot_ids = [l.id for l in db.query(Lot.id).filter(Lot.product_id == product_id).all()]
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

from sqlalchemy.orm import Session
from app.models.wafer import Wafer
from app.models.die_data import DieData


def get_wafer_map(db: Session, wafer_db_id: int) -> dict | None:
    wafer = db.query(Wafer).filter(Wafer.id == wafer_db_id).first()
    if not wafer:
        return None

    dies = db.query(DieData).filter(DieData.wafer_id == wafer_db_id).all()
    if not dies:
        return None

    die_cells = []
    xs, ys = [], []
    for d in dies:
        if d.x_coord is not None and d.y_coord is not None:
            die_cells.append({"x": d.x_coord, "y": d.y_coord, "bin": d.bin})
            xs.append(d.x_coord)
            ys.append(d.y_coord)

    return {
        "waferId": wafer.wafer_id,
        "dies": die_cells,
        "maxX": max(xs) if xs else 0,
        "maxY": max(ys) if ys else 0,
        "minX": min(xs) if xs else 0,
        "minY": min(ys) if ys else 0,
    }


def get_wafer_stats(db: Session, wafer_db_id: int) -> dict | None:
    wafer = db.query(Wafer).filter(Wafer.id == wafer_db_id).first()
    if not wafer:
        return None

    total = wafer.gross_die or 0
    bin1 = wafer.bin1_count or 0
    yield_pct = (bin1 / total * 100) if total > 0 else 0.0

    return {
        "totalDies": total,
        "bin1Pass": bin1,
        "bin1Yield": round(yield_pct, 2),
        "failCount": total - bin1,
    }


def get_bin_distribution(db: Session, wafer_db_id: int) -> list[dict]:
    from sqlalchemy import func

    results = (
        db.query(DieData.bin, func.count(DieData.id))
        .filter(DieData.wafer_id == wafer_db_id)
        .group_by(DieData.bin)
        .order_by(DieData.bin)
        .all()
    )

    return [
        {"bin": bin_val, "label": f"Bin{bin_val}", "count": count}
        for bin_val, count in results
    ]

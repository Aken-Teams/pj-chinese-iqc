from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db
from app.models.lot import Lot
from app.models.spec import CpSpec, PackagingSpec, SpecComparison
from app.schemas.spec import (
    SpecCompareRequest, SpecCompareResponse, CompareRow,
    PackagingSpecCreate, PackagingSpecUpdate, PackagingSpecResponse,
)

router = APIRouter(prefix="/api/specs", tags=["specs"])


@router.post("/compare", response_model=SpecCompareResponse)
def compare_specs(req: SpecCompareRequest, db: Session = Depends(get_db)):
    lot = db.query(Lot).filter(Lot.id == req.lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")

    cp_specs = db.query(CpSpec).filter(CpSpec.lot_id == lot.id).all()
    pkg_specs = db.query(PackagingSpec).filter(PackagingSpec.product_id == lot.product_id).all()

    pkg_map = {ps.param_name: ps for ps in pkg_specs}
    margin_pct = 0.10 if req.rule == "standard" else 0.05

    rows = []
    match_count = 0
    tighter_count = 0
    oor_count = 0

    for cp in cp_specs:
        pkg = pkg_map.get(cp.param_name)
        if not pkg:
            continue

        cp_lower = float(cp.lower_limit) if cp.lower_limit is not None else None
        cp_upper = float(cp.upper_limit) if cp.upper_limit is not None else None
        pkg_lower = float(pkg.lower_limit) if pkg.lower_limit is not None else None
        pkg_upper = float(pkg.upper_limit) if pkg.upper_limit is not None else None

        result = "Match"
        margin_str = "+0%"

        if cp_upper is not None and pkg_upper is not None and cp_upper != 0:
            diff_pct = (pkg_upper - cp_upper) / abs(cp_upper) * 100
            margin_str = f"{diff_pct:+.0f}%"
            if abs(diff_pct) <= margin_pct * 100:
                result = "Match"
                match_count += 1
            elif pkg_upper < cp_upper:
                result = "Tighter"
                tighter_count += 1
            else:
                result = "Out of Range"
                oor_count += 1
        else:
            match_count += 1

        rows.append(CompareRow(
            param=cp.param_name,
            cpLower=f"{cp_lower}" if cp_lower is not None else "-",
            cpUpper=f"{cp_upper}" if cp_upper is not None else "-",
            ftLower=f"{pkg_lower}" if pkg_lower is not None else "-",
            ftUpper=f"{pkg_upper}" if pkg_upper is not None else "-",
            margin=margin_str,
            result=result,
        ))

    return SpecCompareResponse(
        matchCount=match_count,
        tighterCount=tighter_count,
        outOfRangeCount=oor_count,
        rows=rows,
    )


# --- Packaging Specs CRUD ---

@router.get("/packaging", response_model=list[PackagingSpecResponse])
def list_packaging_specs(product_id: int = Query(...), db: Session = Depends(get_db)):
    return (
        db.query(PackagingSpec)
        .filter(PackagingSpec.product_id == product_id)
        .order_by(PackagingSpec.param_name)
        .all()
    )


@router.post("/packaging", response_model=PackagingSpecResponse)
def create_packaging_spec(req: PackagingSpecCreate, db: Session = Depends(get_db)):
    spec = PackagingSpec(**req.model_dump())
    db.add(spec)
    db.commit()
    db.refresh(spec)
    return spec


@router.put("/packaging/{spec_id}", response_model=PackagingSpecResponse)
def update_packaging_spec(spec_id: int, req: PackagingSpecUpdate, db: Session = Depends(get_db)):
    spec = db.query(PackagingSpec).filter(PackagingSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(404, "Spec not found")
    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(spec, field, value)
    db.commit()
    db.refresh(spec)
    return spec


@router.delete("/packaging/{spec_id}")
def delete_packaging_spec(spec_id: int, db: Session = Depends(get_db)):
    spec = db.query(PackagingSpec).filter(PackagingSpec.id == spec_id).first()
    if not spec:
        raise HTTPException(404, "Spec not found")
    db.delete(spec)
    db.commit()
    return {"success": True}

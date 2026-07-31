from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.dependencies import get_db, get_current_user, assert_lot_visible, scope_products_by_domain, can_see_all_domains
from app.models.user import User
from app.models.lot import Lot
from app.models.product import Product
from app.models.spec import CpSpec, PackagingSpec, SpecComparison
from app.models.vendor import Vendor
from app.schemas.spec import (
    SpecCompareRequest, SpecCompareResponse, CompareRow,
    PackagingSpecCreate, PackagingSpecUpdate, PackagingSpecResponse,
)

router = APIRouter(prefix="/api/specs", tags=["specs"])


@router.post("/compare", response_model=SpecCompareResponse)
def compare_specs(req: SpecCompareRequest, db: Session = Depends(get_db),
                  user: User = Depends(get_current_user)):
    lot = db.query(Lot).filter(Lot.id == req.lot_id).first()
    if not lot:
        raise HTTPException(404, "Lot not found")
    assert_lot_visible(lot, user)

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
def list_packaging_specs(
    product_id: int | None = Query(None),
    site: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List packaging specs (scoped to the caller's site via the owning product).

    - With `product_id`: returns specs for that product.
    - Without: returns ALL packaging specs joined with product/vendor info,
      ordered by vendor → product → param. Used by the master specs view.
    """
    q = (
        db.query(PackagingSpec, Product, Vendor)
        .join(Product, PackagingSpec.product_id == Product.id)
        .outerjoin(Vendor, Product.vendor_id == Vendor.id)
    )
    q = scope_products_by_domain(q, user)  # site user -> own site's specs
    if site and can_see_all_domains(user):  # admin narrowing to one site
        q = q.filter(Product.domain == site)
    if product_id is not None:
        q = q.filter(PackagingSpec.product_id == product_id)
    q = q.order_by(Vendor.code, Product.product_code, PackagingSpec.param_name)

    out: list[PackagingSpecResponse] = []
    for spec, product, vendor in q.all():
        out.append(PackagingSpecResponse(
            id=spec.id,
            product_id=spec.product_id,
            param_name=spec.param_name,
            lower_limit=float(spec.lower_limit) if spec.lower_limit is not None else None,
            upper_limit=float(spec.upper_limit) if spec.upper_limit is not None else None,
            unit=spec.unit,
            test_condition=spec.test_condition,
            product_code=product.product_code if product else None,
            vendor_code=vendor.code if vendor else None,
        ))
    return out


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

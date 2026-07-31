import os
import shutil

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db, get_current_user, can_see_all_domains, scope_products_by_domain
from app.models.user import User
from app.models.lot import Lot
from app.models.product import Product
from app.models.review import ReviewRule
from app.models.spec import PackagingSpec
from app.models.vendor import Vendor
from app.schemas.rules import (
    ReviewRuleCreate,
    ReviewRuleUpdate,
    ReviewRuleResponse,
    RulePreviewRow,
    RulesImportPreview,
    RulesImportConfirmRequest,
    RulesImportResult,
)
from app.services.rules_import_parser import build_import_preview, parse_review_rules_excel

router = APIRouter(prefix="/api/rules", tags=["rules"])

_IMPORT_ERR = {
    "zh-TW": {
        "no_file": "請上傳 Excel 檔案（.xlsx）",
        "parse_failed": "檔案解析失敗：{detail}",
        "no_rules": "未從檔案中解析出任何規則",
        "no_rules_confirm": "沒有可匯入的規則",
    },
    "zh-CN": {
        "no_file": "请上传 Excel 文件（.xlsx）",
        "parse_failed": "文件解析失败：{detail}",
        "no_rules": "未从文件中解析出任何规则",
        "no_rules_confirm": "没有可导入的规则",
    },
    "en": {
        "no_file": "Please upload an Excel file (.xlsx)",
        "parse_failed": "Failed to parse file: {detail}",
        "no_rules": "No rules were parsed from the file",
        "no_rules_confirm": "No rules to import",
    },
}


@router.get("", response_model=list[ReviewRuleResponse])
def list_rules(
    product_id: int | None = Query(None),
    site: str = "",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """List review rules (scoped to the caller's site via the owning product).

    - With `product_id`: returns rules for that product.
    - Without: returns ALL rules joined with product/vendor info, ordered by
      vendor → product → param. Used by the master rules view.
    """
    q = (
        db.query(ReviewRule, Product, Vendor)
        .join(Product, ReviewRule.product_id == Product.id)
        .outerjoin(Vendor, Product.vendor_id == Vendor.id)
    )
    q = scope_products_by_domain(q, user)  # site user -> own site's rules
    if site and can_see_all_domains(user):  # admin narrowing to one site
        q = q.filter(Product.domain == site)
    if product_id is not None:
        q = q.filter(ReviewRule.product_id == product_id)
    q = q.order_by(Vendor.code, Product.product_code, ReviewRule.param_name)

    out: list[ReviewRuleResponse] = []
    for rule, product, vendor in q.all():
        out.append(ReviewRuleResponse(
            id=rule.id,
            product_id=rule.product_id,
            param_name=rule.param_name,
            q1_lower=rule.q1_lower,
            q1_upper=rule.q1_upper,
            q2_lower=rule.q2_lower,
            q2_upper=rule.q2_upper,
            q3_lower=rule.q3_lower,
            q3_upper=rule.q3_upper,
            product_code=product.product_code if product else None,
            vendor_code=vendor.code if vendor else None,
            domain=product.domain if product else None,
        ))
    return out


@router.post("", response_model=ReviewRuleResponse)
def create_rule(req: ReviewRuleCreate, db: Session = Depends(get_db)):
    rule = ReviewRule(**req.model_dump())
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return rule


@router.put("/{rule_id}", response_model=ReviewRuleResponse)
def update_rule(rule_id: int, req: ReviewRuleUpdate, db: Session = Depends(get_db)):
    rule = db.query(ReviewRule).filter(ReviewRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    for field, value in req.model_dump(exclude_unset=True).items():
        setattr(rule, field, value)
    db.commit()
    db.refresh(rule)
    return rule


@router.delete("/{rule_id}")
def delete_rule(rule_id: int, db: Session = Depends(get_db)):
    rule = db.query(ReviewRule).filter(ReviewRule.id == rule_id).first()
    if not rule:
        raise HTTPException(404, "Rule not found")
    db.delete(rule)
    db.commit()
    return {"success": True}


@router.delete("/product/{product_id}")
def delete_product_rules(product_id: int, db: Session = Depends(get_db)):
    """Delete all review rules for a product. If the product has no other
    data (no lots, no packaging specs), the product itself is also removed.
    Useful for cleaning up wrongly imported / auto-created products.
    """
    product = db.query(Product).filter(Product.id == product_id).first()
    if not product:
        raise HTTPException(404, "Product not found")

    deleted_rules = (
        db.query(ReviewRule)
        .filter(ReviewRule.product_id == product_id)
        .delete(synchronize_session=False)
    )

    has_lots = (
        db.query(Lot.id).filter(Lot.product_id == product_id).first() is not None
    )
    has_specs = (
        db.query(PackagingSpec.id)
        .filter(PackagingSpec.product_id == product_id)
        .first() is not None
    )

    deleted_product = False
    if not has_lots and not has_specs:
        db.delete(product)
        deleted_product = True

    db.commit()
    return {
        "success": True,
        "deleted_rules": deleted_rules,
        "deleted_product": deleted_product,
        "kept_reason": None if deleted_product else ("has_lots" if has_lots else "has_specs"),
    }


# ---------------------------------------------------------------------------
# Import endpoints
# ---------------------------------------------------------------------------

def _err(lang: str, key: str, **kw: str) -> str:
    msgs = _IMPORT_ERR.get(lang, _IMPORT_ERR["en"])
    return msgs.get(key, key).format(**kw)


@router.post("/import-preview", response_model=RulesImportPreview)
def import_preview(
    file: UploadFile = File(...),
    lang: str = Form("zh-TW"),
    db: Session = Depends(get_db),
):
    if not file.filename or not file.filename.lower().endswith((".xlsx", ".xls")):
        raise HTTPException(400, _err(lang, "no_file"))

    # Save to uploads dir
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    dest = os.path.join(settings.UPLOAD_DIR, f"rules_import_{file.filename}")
    with open(dest, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Parse
    try:
        parsed = parse_review_rules_excel(dest)
    except Exception as e:
        raise HTTPException(400, _err(lang, "parse_failed", detail=str(e)))

    raw_rules = parsed["rules"]
    if not raw_rules:
        raise HTTPException(400, _err(lang, "no_rules"))

    # Build preview with DB matching
    preview_rows = build_import_preview(db, raw_rules)

    ready = sum(
        1 for r in preview_rows
        if r["status"] in ("ready", "update_existing", "auto_create")
    )
    warning = sum(
        1 for r in preview_rows
        if r["status"] in ("no_param_match", "no_vendor")
    )

    return RulesImportPreview(
        file_path=dest,
        sheets_parsed=parsed["sheets_parsed"],
        total_rules=len(preview_rows),
        ready_count=ready,
        warning_count=warning,
        rules=[RulePreviewRow(**r) for r in preview_rows],
    )


@router.post("/import-confirm", response_model=RulesImportResult)
def import_confirm(
    req: RulesImportConfirmRequest,
    lang: str = Query("zh-TW"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not req.rules:
        raise HTTPException(400, _err(lang, "no_rules_confirm"))

    created = 0
    updated = 0
    skipped = 0
    products_created = 0

    # Cache: vendor_code -> vendor_id
    vendor_cache = {v.code: v.id for v in db.query(Vendor).all()}
    # Cache: product_code -> product_id (refreshed after auto-create)
    product_cache: dict[str, int] = {}

    for item in req.rules:
        product_id = item.product_id

        # Auto-create product if needed
        if product_id is None:
            if not item.product_code or not item.vendor_code:
                skipped += 1
                continue
            if item.product_code in product_cache:
                product_id = product_cache[item.product_code]
            else:
                vendor_id = vendor_cache.get(item.vendor_code)
                if not vendor_id:
                    skipped += 1
                    continue
                # Look up / create within the importer's own site so a rules
                # import never attaches to another site's product.
                existing_product = (
                    db.query(Product)
                    .filter(
                        Product.product_code == item.product_code,
                        Product.domain == user.domain,
                    )
                    .first()
                )
                if existing_product:
                    product_id = existing_product.id
                else:
                    new_product = Product(
                        product_code=item.product_code,
                        vendor_id=vendor_id,
                        domain=user.domain,
                    )
                    db.add(new_product)
                    db.flush()
                    product_id = new_product.id
                    products_created += 1
                product_cache[item.product_code] = product_id

        existing = (
            db.query(ReviewRule)
            .filter(
                ReviewRule.product_id == product_id,
                ReviewRule.param_name == item.param_name,
            )
            .first()
        )
        if existing:
            existing.q1_lower = item.q1_lower
            existing.q1_upper = item.q1_upper
            existing.q2_lower = item.q2_lower
            existing.q2_upper = item.q2_upper
            existing.q3_lower = item.q3_lower
            existing.q3_upper = item.q3_upper
            updated += 1
        else:
            db.add(ReviewRule(
                product_id=product_id,
                param_name=item.param_name,
                q1_lower=item.q1_lower,
                q1_upper=item.q1_upper,
                q2_lower=item.q2_lower,
                q2_upper=item.q2_upper,
                q3_lower=item.q3_lower,
                q3_upper=item.q3_upper,
            ))
            created += 1

    db.commit()

    # Cleanup uploaded file
    if req.file_path and os.path.exists(req.file_path):
        try:
            os.remove(req.file_path)
        except OSError:
            pass

    return RulesImportResult(
        created=created,
        updated=updated,
        skipped=skipped,
        products_created=products_created,
    )

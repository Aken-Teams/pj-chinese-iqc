import os
import re
import shutil
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db, get_current_user, get_optional_user, scope_formats_by_domain
from app.models.user import User
from app.models.vendor import Vendor, VendorFormat
from app.models.product import Product
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.die_data import DieData, ElectricalValue
from app.models.spec import CpSpec
from app.schemas.upload import UploadPreview, UploadConfirmRequest
from app.services.parser.dynamic_parser import DynamicParser
from app.services.parser.grid import is_supported

router = APIRouter(prefix="/api/upload", tags=["upload"])

_ERR = {
    "zh-TW": {
        "cannot_detect": "無法識別檔案格式，請先選擇廠商再上傳",
        "xls_not_supported": "此 .xls 檔案無法讀取，可能已損毀或受密碼保護；請用 Excel 另存後再上傳",
        "parse_failed": "檔案解析失敗：{detail}",
        "no_format_config": "廠商 {vendor} 尚未設定格式模板，請先至「廠商管理」設定後再上傳",
        "unsupported_format": "不支援此檔案格式，請上傳 .xlsx、.xlsm、.xls、.csv 或 .txt 格式",
        "product_vendor_mismatch": "產品 {code} 已屬於廠商 {existing}，無法以 {new} 匯入。請確認廠商選擇，或先在「審核規則」刪除衝突的產品規則。",
    },
    "zh-CN": {
        "cannot_detect": "无法识别文件格式，请先选择厂商再上传",
        "xls_not_supported": "此 .xls 文件无法读取，可能已损坏或受密码保护；请用 Excel 另存后再上传",
        "parse_failed": "文件解析失败：{detail}",
        "no_format_config": "厂商 {vendor} 尚未设定格式模板，请先至「厂商管理」设定后再上传",
        "unsupported_format": "不支持此文件格式，请上传 .xlsx、.xlsm、.xls、.csv 或 .txt 格式",
        "product_vendor_mismatch": "产品 {code} 已属于厂商 {existing}，无法以 {new} 导入。请确认厂商选择，或先在\"审核规则\"删除冲突的产品规则。",
    },
    "en": {
        "cannot_detect": "Cannot detect file format. Please select a vendor and try again.",
        "xls_not_supported": "This .xls file could not be read; it may be corrupt or password-protected.",
        "parse_failed": "Failed to parse file: {detail}",
        "no_format_config": "Vendor {vendor} has no format configured. Please set it up in Vendor Management first.",
        "unsupported_format": "Unsupported file format. Please upload .xlsx, .xlsm, .xls, .csv or .txt files.",
        "product_vendor_mismatch": "Product {code} already belongs to vendor {existing}, cannot import as {new}. Please verify the vendor selection, or remove the conflicting product rules first.",
    },
}


def _safe_name(name: str) -> str:
    """Reduce an uploaded name to a bare, safe file name.

    A multipart part can carry any string as its filename, including "../..",
    which os.path.join would happily follow out of the upload directory.
    """
    base = os.path.basename((name or "").replace("\\", "/")).strip()
    base = re.sub(r'[<>:"|?*\x00-\x1f]', "_", base)
    base = base.lstrip(".") or "upload"
    return base[:180]


def _save_upload(file: UploadFile) -> str:
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, _safe_name(file.filename))
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return file_path


def _check_supported(original_name: str, err: dict) -> None:
    """Reject file types the parser cannot read.

    No format conversion happens any more: the parser's grid layer reads
    .xlsx/.xlsm/.xls/.csv/.txt directly, so CSV and XLS uploads are no longer
    rewritten into a temporary .xlsx first. That round-trip lost cell types and
    could not represent the tab-delimited .txt dumps two 無錫 vendors ship.
    """
    if not is_supported(original_name or ""):
        raise HTTPException(400, err.get("unsupported_format", "Unsupported format"))


def _build_vendor_parser(vendor: str, actual_path: str, err: dict, db: Session, user=None) -> DynamicParser:
    """Build a parser for an explicitly chosen vendor. When the vendor has
    multiple templates, probe each and keep the one with the most data rows.
    Only the uploader's own site templates are considered (no cross-site mix)."""
    vendor_obj = db.query(Vendor).filter(Vendor.code == vendor).first()
    if not vendor_obj:
        raise HTTPException(400, err["no_format_config"].format(vendor=vendor))

    fmts = scope_formats_by_domain(
        db.query(VendorFormat).filter(VendorFormat.vendor_id == vendor_obj.id), user
    ).all()
    if not fmts:
        raise HTTPException(400, err["no_format_config"].format(vendor=vendor))

    if len(fmts) == 1:
        return DynamicParser.from_vendor_format(vendor, fmts[0])

    best_parser, best_rows = None, 0
    for fmt in fmts:
        parser = DynamicParser.from_vendor_format(vendor, fmt)
        try:
            rows = parser.preview(actual_path).get("dataRows", 0)
        except Exception:
            continue
        if rows > best_rows:
            best_rows, best_parser = rows, parser

    return best_parser or DynamicParser.from_vendor_format(vendor, fmts[0])


def _preview_quality(pv: dict) -> tuple:
    """Rank one template's reading of a file, best first when sorted descending.

    Row count alone is not evidence of a match. Every template walks the same
    sheet, so a wrong one still counts roughly the same number of non-blank
    rows -- 東部高科's file scored 5,556 rows under XRW's template versus 5,550
    under its own, and XRW won by six rows while extracting no parameters, no
    lot and a product id of "PROBE CARD ID:" (a stray label, not a value).

    What actually separates right from wrong is whether the template pulled
    structured data out: parameters and wafers first, identifiers next, and
    only then row count as a tie-break.
    """
    n_params = len(pv.get("paramNames") or [])
    n_wafers = pv.get("wafersDetected") or 0
    return (
        1 if (n_params > 0 and n_wafers > 0) else 0,   # read both -> real match
        1 if n_params > 0 else 0,
        1 if n_wafers > 0 else 0,
        1 if _looks_like_id(pv.get("lotId")) else 0,
        1 if _looks_like_id(pv.get("productId")) else 0,
        # Fewer non-die rows beats more rows: a template aimed one row too high
        # reads a separator line as data and would otherwise win on row count.
        -(pv.get("junkRows") or 0),
        pv.get("dataRows", 0),
    )


def _looks_like_id(value) -> bool:
    """True for something that reads as a lot/product code rather than a label
    that leaked out of a neighbouring cell (e.g. "PROBE CARD ID:")."""
    if not value:
        return False
    text = str(value).strip()
    return bool(text) and ":" not in text and len(text) <= 40


def _detect_best_across_vendors(actual_path: str, db: Session, user=None) -> tuple[str | None, DynamicParser | None, int]:
    """Probe every vendor's every format template against the file and return
    the (vendor_code, parser, data_rows) of the best reading. Only the
    uploader's own site templates are tried, so one site's template never
    detects another site's file. Ranking is by _preview_quality, not row count.
    """
    best_vendor, best_parser, best_rows = None, None, 0
    best_score: tuple | None = None
    for v in db.query(Vendor).all():
        fmts = scope_formats_by_domain(
            db.query(VendorFormat).filter(VendorFormat.vendor_id == v.id), user
        ).all()
        for fmt in fmts:
            parser = DynamicParser.from_vendor_format(v.code, fmt)
            try:
                pv = parser.preview(actual_path)
            except Exception:
                continue
            rows = pv.get("dataRows", 0)
            if rows <= 0:
                continue
            score = _preview_quality(pv)
            if best_score is None or score > best_score:
                best_vendor, best_parser, best_rows, best_score = v.code, parser, rows, score
    return best_vendor, best_parser, best_rows


def _resolve_parser(file_path: str, original_name: str, vendor: str, err: dict, db: Session = None, user=None):
    """Return (parser_instance, path_to_use).

    When a vendor is given it is used (probing its own templates); when it is
    blank the file is auto-detected across the uploader's site templates.
    """
    _check_supported(original_name, err)
    actual_path = file_path
    if not db:
        raise HTTPException(500, "Database session not available")

    if vendor:
        return _build_vendor_parser(vendor, actual_path, err, db, user), actual_path

    _, parser, _ = _detect_best_across_vendors(actual_path, db, user)
    if not parser:
        raise HTTPException(400, err["cannot_detect"])
    return parser, actual_path


def _persist_result(result, db: Session, err: dict | None = None, domain: str | None = None) -> dict:
    """Persist parsed CP data to DB, return import summary.

    `domain` tags the lot with the uploader's AD site (廠區) so later reads can
    scope data per site. None = unassigned (legacy/admin), admin-only visibility.
    """
    err = err or _ERR["en"]
    vendor = db.query(Vendor).filter(Vendor.code == result.vendor_code).first()
    if not vendor:
        raise HTTPException(400, f"Vendor {result.vendor_code} not found in database")

    product_code = result.product_id.strip() if result.product_id else ""
    if not product_code:
        product_code = f"{result.vendor_code}_default"

    # product_code is unique PER SITE — look it up within the uploader's own
    # domain so 無錫's upload uses 無錫's product/specs, never 徐州's.
    product = (
        db.query(Product)
        .filter(Product.product_code == product_code, Product.domain == domain)
        .first()
    )
    if product:
        if product.vendor_id is None:
            # Orphaned product (rules-imported without a vendor) → claim it.
            product.vendor_id = vendor.id
            db.flush()
        elif product.vendor_id != vendor.id:
            existing_vendor = (
                db.query(Vendor).filter(Vendor.id == product.vendor_id).first()
            )
            existing_code = existing_vendor.code if existing_vendor else f"id={product.vendor_id}"
            raise HTTPException(
                400,
                err["product_vendor_mismatch"].format(
                    code=product_code,
                    existing=existing_code,
                    new=vendor.code,
                ),
            )
    else:
        product = Product(product_code=product_code, vendor_id=vendor.id, domain=domain)
        db.add(product)
        db.flush()

    # Several vendors (新潔能, 禾納, 天狼芯) ship one file per wafer, so a single
    # lot arrives as N uploads. Creating a lot per file split one 5-wafer lot
    # into five 1-wafer lots: the picker showed five identical rows and every
    # yield figure was computed over one wafer. Same site + same product + same
    # lot number is the same lot, so later files join the existing one.
    #
    # A lot with no readable number cannot be identified, so it always gets its
    # own row rather than collecting unrelated uploads together.
    lot = None
    if result.lot_id:
        lot = (
            db.query(Lot)
            .filter(
                Lot.lot_id == result.lot_id,
                Lot.product_id == product.id,
                Lot.domain == domain,
            )
            .order_by(Lot.id)
            .first()
        )

    merged_into_existing = lot is not None
    if lot is None:
        lot = Lot(
            lot_id=result.lot_id,
            mark_lot_id=result.mark_lot_id,
            product_id=product.id,
            test_program=result.test_program,
            file_name=result.lot_id,
            status="pending",
            domain=domain,
            test_date=getattr(result, "test_date", None),
        )
        db.add(lot)
        db.flush()

    # A lot assembled from several files spans whatever period they were tested
    # over; the earliest stamp is when that lot's testing began.
    incoming_date = getattr(result, "test_date", None)
    if incoming_date is not None and (lot.test_date is None or incoming_date < lot.test_date):
        lot.test_date = incoming_date

    # Limits are per lot, not per file. Keep the first file's and only fill in
    # parameters the earlier files did not carry.
    known_params = {
        r[0] for r in db.query(CpSpec.param_name).filter(CpSpec.lot_id == lot.id).all()
    }
    for spec in result.cp_specs:
        if spec.param_name in known_params:
            continue
        known_params.add(spec.param_name)
        db.add(CpSpec(
            lot_id=lot.id,
            param_name=spec.param_name,
            lower_limit=spec.lower_limit,
            upper_limit=spec.upper_limit,
            unit=spec.unit,
        ))

    # Re-uploading a file already in the lot must not double its dies, so a
    # wafer id already present is replaced rather than added alongside.
    existing_wafers = {
        w.wafer_id: w for w in db.query(Wafer).filter(Wafer.lot_id == lot.id).all()
    }
    added_wafers = 0

    for pw in result.wafers:
        prior = existing_wafers.get(pw.wafer_id)
        if prior is not None:
            db.delete(prior)
            db.flush()
        else:
            added_wafers += 1
        wafer = Wafer(
            lot_id=lot.id,
            wafer_id=pw.wafer_id,
            gross_die=pw.gross_die,
            bin1_count=pw.bin1_count,
            bin1_yield=pw.bin1_count / pw.gross_die if pw.gross_die > 0 else 0,
            cp_step=pw.cp_step,
        )
        db.add(wafer)
        db.flush()

        die_rows = [
            {"wafer_id": wafer.id, "site_no": d.site_no, "bin": d.bin,
             "x_coord": d.x_coord, "y_coord": d.y_coord}
            for d in pw.dies
        ]
        if die_rows:
            db.execute(DieData.__table__.insert(), die_rows)
            db.flush()

        die_ids = [
            r[0] for r in db.execute(
                text("SELECT id FROM die_data WHERE wafer_id = :wid ORDER BY id"),
                {"wid": wafer.id}
            ).fetchall()
        ]

        ev_rows = []
        for die_id, die in zip(die_ids, pw.dies):
            for pname, val in die.electrical.items():
                if val is not None:
                    ev_rows.append({"die_id": die_id, "param_name": pname, "value": val})
        if ev_rows:
            db.execute(ElectricalValue.__table__.insert(), ev_rows)

    # Appending wafers invalidates any review already run on this lot.
    if merged_into_existing and added_wafers:
        lot.status = "pending"

    db.flush()
    lot_wafers = db.query(Wafer).filter(Wafer.lot_id == lot.id).count()
    db.commit()
    return {
        "success": True,
        "lotId": lot.id,
        "lotCode": lot.lot_id,
        # The lot's wafer count, not the file's: after a merge the second
        # number is what the user needs to see.
        "waferCount": lot_wafers,
        "mergedIntoExisting": merged_into_existing,
        "totalRows": result.total_rows,
        # Echoed back so a batch row can say which supplier the file was read
        # as. With auto-detect on, that is the one thing the uploader cannot
        # tell by looking at the file name.
        "vendor": vendor.code,
        "vendorName": vendor.name,
    }


@router.post("/cp-data", response_model=UploadPreview)
async def upload_cp_data(
    file: UploadFile = File(...),
    vendor: str = Form(""),
    lang: str = Form("zh-TW"),
    db: Session = Depends(get_db),
    user: User | None = Depends(get_optional_user),
):
    """Upload CP Excel file and return a preview.

    The file is always auto-detected across all vendors so the UI can tell the
    user which vendor it belongs to. An explicitly chosen `vendor` still wins for
    the parse (so users can override), and `detectedVendor` lets the UI warn when
    the choice doesn't match the file.
    """
    err = _ERR.get(lang, _ERR["zh-TW"])
    file_path = _save_upload(file)

    _check_supported(file.filename, err)
    actual_path = file_path

    # Always detect the best-matching vendor from the uploader's site templates.
    det_vendor, det_parser, det_rows = _detect_best_across_vendors(actual_path, db, user)

    # Selection wins for the actual parse; fall back to detection when blank.
    if vendor:
        parser = _build_vendor_parser(vendor, actual_path, err, db, user)
    elif det_parser:
        parser = det_parser
    else:
        raise HTTPException(400, err["cannot_detect"])

    try:
        preview = parser.preview(actual_path)
    except Exception as e:
        err_str = str(e)
        if "old .xls" in err_str or "xlrd" in err_str:
            raise HTTPException(400, err["xls_not_supported"])
        raise HTTPException(400, err["parse_failed"].format(detail=err_str))

    return UploadPreview(
        fileName=file.filename,
        wafersDetected=preview["wafersDetected"],
        diePerWafer=preview.get("diePerWafer"),
        dataRows=preview["dataRows"],
        format=preview["format"],
        productId=preview.get("productId"),
        lotId=preview.get("lotId"),
        paramNames=preview.get("paramNames", []),
        detectedVendor=det_vendor,
        detectedRows=det_rows,
    )


@router.post("/confirm")
def confirm_upload(
    req: UploadConfirmRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Parse file fully and persist to database."""
    err = _ERR.get(getattr(req, "lang", None) or "zh-TW", _ERR["zh-TW"])
    file_path = req.file_path
    if not os.path.exists(file_path):
        file_path = os.path.join(settings.UPLOAD_DIR, req.file_path)
    if not os.path.exists(file_path):
        raise HTTPException(400, "File not found")

    # No conversion step: the parser reads every supported extension directly.
    # Use VendorFormat from DB (configured in 廠商管理)
    vendor_code = req.vendor_code
    vendor_obj = db.query(Vendor).filter(Vendor.code == vendor_code).first()
    if not vendor_obj:
        raise HTTPException(400, f"Vendor {vendor_code} not found in database")

    # Only the uploader's own site templates (matches the preview step).
    fmts = scope_formats_by_domain(
        db.query(VendorFormat).filter(VendorFormat.vendor_id == vendor_obj.id), user
    ).all()
    if not fmts:
        raise HTTPException(400, f"Vendor {vendor_code} has no format configured")

    # Auto-detect best template when multiple exist
    if len(fmts) == 1:
        parser = DynamicParser.from_vendor_format(vendor_code, fmts[0])
    else:
        best_parser = None
        best_rows = 0
        for fmt in fmts:
            p = DynamicParser.from_vendor_format(vendor_code, fmt)
            try:
                preview = p.preview(file_path)
                rows = preview.get("dataRows", 0)
                if rows > best_rows:
                    best_rows = rows
                    best_parser = p
            except Exception:
                continue
        parser = best_parser or DynamicParser.from_vendor_format(vendor_code, fmts[0])

    result = parser.parse(file_path)
    return _persist_result(result, db, err, domain=user.domain)


@router.post("/batch")
async def batch_upload(
    files: List[UploadFile] = File(...),
    vendor: str = Form(""),
    lang: str = Form("zh-TW"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    """Upload and auto-import multiple CP Excel files without a preview step."""
    err = _ERR.get(lang, _ERR["zh-TW"])
    results = []

    for file in files:
        entry: dict = {"fileName": file.filename, "success": False, "error": None,
                       "vendor": vendor or None, "vendorName": None}
        try:
            file_path = _save_upload(file)
            parser, actual_path = _resolve_parser(file_path, file.filename, vendor, err, db, user)
            # Set before parsing: a file that fails halfway is still worth
            # labelling, since "which vendor did it think this was" is usually
            # the first question about a failure.
            entry["vendor"] = getattr(parser, "vendor_code", None) or entry["vendor"]
            parsed = parser.parse(actual_path)
            summary = _persist_result(parsed, db, err, domain=user.domain)
            entry.update(summary)
        except HTTPException as exc:
            entry["error"] = exc.detail
        except Exception as exc:
            entry["error"] = str(exc)
        results.append(entry)

    return results

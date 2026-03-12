import os
import shutil
from typing import List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.dependencies import get_db
from app.models.vendor import Vendor, VendorFormat
from app.models.product import Product
from app.models.lot import Lot
from app.models.wafer import Wafer
from app.models.die_data import DieData, ElectricalValue
from app.models.spec import CpSpec
from app.schemas.upload import UploadPreview, UploadConfirmRequest
from app.services.parser.auto_detect import auto_detect_parser
from app.services.parser.jjw_parser import JJWParser
from app.services.parser.xrw_parser import XRWParser

router = APIRouter(prefix="/api/upload", tags=["upload"])

PARSERS = {
    "JJW": JJWParser,
    "XRW": XRWParser,
}

_ERR = {
    "zh-TW": {
        "cannot_detect": "無法識別檔案格式，請手動選擇廠商後重新上傳",
        "xls_not_supported": "不支援舊版 .xls 格式，請用 Excel 另存為 .xlsx 後再上傳",
        "parse_failed": "檔案解析失敗：{detail}",
        "format_mismatch": "檔案格式偵測為 {detected}，與選擇廠商 {selected} 不符，請確認後重新上傳",
        "unsupported_format": "不支援此檔案格式，請上傳 .xlsx 或 .xls 格式",
    },
    "zh-CN": {
        "cannot_detect": "无法识别文件格式，请手动选择厂商后重新上传",
        "xls_not_supported": "不支持旧版 .xls 格式，请用 Excel 另存为 .xlsx 后再上传",
        "parse_failed": "文件解析失败：{detail}",
        "format_mismatch": "文件格式检测为 {detected}，与选择厂商 {selected} 不符，请确认后重新上传",
        "unsupported_format": "不支持此文件格式，请上传 .xlsx 或 .xls 格式",
    },
    "en": {
        "cannot_detect": "Cannot detect file format. Please select a vendor and try again.",
        "xls_not_supported": "Old .xls format is not supported. Please save as .xlsx and try again.",
        "parse_failed": "Failed to parse file: {detail}",
        "format_mismatch": "File detected as {detected} format but {selected} was selected. Please check and re-upload.",
        "unsupported_format": "Unsupported file format. Please upload .xlsx or .xls files.",
    },
}

_PARSER_VENDOR = {v: k for k, v in PARSERS.items()}


def _convert_xls_to_xlsx(xls_path: str) -> str:
    """Convert .xls file to a temporary .xlsx file using pandas+xlrd+openpyxl."""
    import pandas as pd
    xlsx_path = xls_path + ".xlsx"
    df_dict = pd.read_excel(xls_path, sheet_name=None, header=None, engine="xlrd")
    with pd.ExcelWriter(xlsx_path, engine="openpyxl") as writer:
        for sheet_name, df in df_dict.items():
            df.to_excel(writer, sheet_name=sheet_name, index=False, header=False)
    return xlsx_path


def _save_upload(file: UploadFile) -> str:
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return file_path


def _resolve_parser(file_path: str, original_name: str, vendor: str, err: dict):
    """Return (parser_instance, actual_path_to_use), handling .xls conversion."""
    name_lower = original_name.lower()
    actual_path = file_path

    if name_lower.endswith(".xls") and not name_lower.endswith(".xlsx"):
        actual_path = _convert_xls_to_xlsx(file_path)
    elif not name_lower.endswith(".xlsx"):
        raise HTTPException(400, err.get("unsupported_format", "Unsupported format"))

    if vendor and vendor in PARSERS:
        detected = auto_detect_parser(actual_path)
        if detected is not None and not isinstance(detected, PARSERS[vendor]):
            detected_vendor = _PARSER_VENDOR.get(type(detected), "unknown")
            raise HTTPException(400, err["format_mismatch"].format(selected=vendor, detected=detected_vendor))
        return PARSERS[vendor](), actual_path
    else:
        parser = auto_detect_parser(actual_path)
        if not parser:
            raise HTTPException(400, err["cannot_detect"])
        return parser, actual_path


def _persist_result(result, db: Session) -> dict:
    """Persist parsed CP data to DB, return import summary."""
    vendor = db.query(Vendor).filter(Vendor.code == result.vendor_code).first()
    if not vendor:
        raise HTTPException(400, f"Vendor {result.vendor_code} not found in database")

    product = db.query(Product).filter(Product.product_code == result.product_id).first()
    if not product:
        product = Product(product_code=result.product_id, vendor_id=vendor.id)
        db.add(product)
        db.flush()

    lot = Lot(
        lot_id=result.lot_id,
        mark_lot_id=result.mark_lot_id,
        product_id=product.id,
        test_program=result.test_program,
        file_name=result.lot_id,
        status="pending",
    )
    db.add(lot)
    db.flush()

    for spec in result.cp_specs:
        db.add(CpSpec(
            lot_id=lot.id,
            param_name=spec.param_name,
            lower_limit=spec.lower_limit,
            upper_limit=spec.upper_limit,
            unit=spec.unit,
        ))

    for pw in result.wafers:
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

    db.commit()
    return {
        "success": True,
        "lotId": lot.id,
        "lotCode": lot.lot_id,
        "waferCount": len(result.wafers),
        "totalRows": result.total_rows,
    }


@router.post("/cp-data", response_model=UploadPreview)
async def upload_cp_data(
    file: UploadFile = File(...),
    vendor: str = Form(""),
    lang: str = Form("zh-TW"),
    db: Session = Depends(get_db),
):
    """Upload CP Excel file and return preview."""
    err = _ERR.get(lang, _ERR["zh-TW"])
    file_path = _save_upload(file)

    try:
        parser, actual_path = _resolve_parser(file_path, file.filename, vendor, err)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(400, err["parse_failed"].format(detail=str(e)))

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
    )


@router.post("/confirm")
def confirm_upload(
    req: UploadConfirmRequest,
    db: Session = Depends(get_db),
):
    """Parse file fully and persist to database."""
    file_path = req.file_path
    if not os.path.exists(file_path):
        file_path = os.path.join(settings.UPLOAD_DIR, req.file_path)
    if not os.path.exists(file_path):
        raise HTTPException(400, "File not found")

    # Handle .xls conversion for confirm step
    if file_path.lower().endswith(".xls") and not file_path.lower().endswith(".xlsx"):
        file_path = _convert_xls_to_xlsx(file_path)

    parser_cls = PARSERS.get(req.vendor_code)
    if not parser_cls:
        raise HTTPException(400, f"Unknown vendor code: {req.vendor_code}")

    parser = parser_cls()
    result = parser.parse(file_path)
    return _persist_result(result, db)


@router.post("/batch")
async def batch_upload(
    files: List[UploadFile] = File(...),
    vendor: str = Form(""),
    lang: str = Form("zh-TW"),
    db: Session = Depends(get_db),
):
    """Upload and auto-import multiple CP Excel files without a preview step."""
    err = _ERR.get(lang, _ERR["zh-TW"])
    results = []

    for file in files:
        entry: dict = {"fileName": file.filename, "success": False, "error": None}
        try:
            file_path = _save_upload(file)
            parser, actual_path = _resolve_parser(file_path, file.filename, vendor, err)
            parsed = parser.parse(actual_path)
            summary = _persist_result(parsed, db)
            entry.update(summary)
        except HTTPException as exc:
            entry["error"] = exc.detail
        except Exception as exc:
            entry["error"] = str(exc)
        results.append(entry)

    return results

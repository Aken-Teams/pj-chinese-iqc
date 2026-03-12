import os
import shutil
from pathlib import Path

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
    },
    "zh-CN": {
        "cannot_detect": "无法识别文件格式，请手动选择厂商后重新上传",
        "xls_not_supported": "不支持旧版 .xls 格式，请用 Excel 另存为 .xlsx 后再上传",
        "parse_failed": "文件解析失败：{detail}",
    },
    "en": {
        "cannot_detect": "Cannot detect file format. Please select a vendor and try again.",
        "xls_not_supported": "Old .xls format is not supported. Please save as .xlsx and try again.",
        "parse_failed": "Failed to parse file: {detail}",
    },
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
    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    file_path = os.path.join(settings.UPLOAD_DIR, file.filename)

    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)

    # Try auto-detect or use provided vendor
    parser = None
    if vendor and vendor in PARSERS:
        parser = PARSERS[vendor]()
    else:
        parser = auto_detect_parser(file_path)

    if not parser:
        raise HTTPException(400, err["cannot_detect"])

    try:
        preview = parser.preview(file_path)
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
        # Try in uploads dir
        file_path = os.path.join(settings.UPLOAD_DIR, req.file_path)
    if not os.path.exists(file_path):
        raise HTTPException(400, "File not found")

    parser_cls = PARSERS.get(req.vendor_code)
    if not parser_cls:
        raise HTTPException(400, f"Unknown vendor code: {req.vendor_code}")

    parser = parser_cls()
    result = parser.parse(file_path)

    # Find or create vendor
    vendor = db.query(Vendor).filter(Vendor.code == result.vendor_code).first()
    if not vendor:
        raise HTTPException(400, f"Vendor {result.vendor_code} not found in database")

    # Find or create product
    product = db.query(Product).filter(Product.product_code == result.product_id).first()
    if not product:
        product = Product(product_code=result.product_id, vendor_id=vendor.id)
        db.add(product)
        db.flush()

    # Create lot
    lot = Lot(
        lot_id=result.lot_id,
        mark_lot_id=result.mark_lot_id,
        product_id=product.id,
        test_program=result.test_program,
        file_name=os.path.basename(file_path),
        status="pending",
    )
    db.add(lot)
    db.flush()

    # Save CP specs
    for spec in result.cp_specs:
        db.add(CpSpec(
            lot_id=lot.id,
            param_name=spec.param_name,
            lower_limit=spec.lower_limit,
            upper_limit=spec.upper_limit,
            unit=spec.unit,
        ))

    # Save wafers and dies using raw SQL bulk inserts for performance
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

        # Bulk insert dies using raw SQL for speed
        die_rows = [
            {"wafer_id": wafer.id, "site_no": d.site_no, "bin": d.bin,
             "x_coord": d.x_coord, "y_coord": d.y_coord}
            for d in pw.dies
        ]
        if die_rows:
            db.execute(DieData.__table__.insert(), die_rows)
            db.flush()

        # Get the die IDs just inserted (ordered by id)
        die_ids = [
            r[0] for r in db.execute(
                text("SELECT id FROM die_data WHERE wafer_id = :wid ORDER BY id"),
                {"wid": wafer.id}
            ).fetchall()
        ]

        # Bulk insert electrical values using raw SQL
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

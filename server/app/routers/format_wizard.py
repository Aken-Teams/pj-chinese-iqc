"""Template wizard: upload a sample CP file, get a layout back, try it, save it.

This replaces typing fourteen row/column numbers into a form by hand. The flow
the UI drives is:

    POST /detect    sample file      -> detected layout + evidence + preview grid
    POST /dry-run   draft template   -> what that template actually parses
    (save via the existing POST /api/vendors/{id}/formats)

Dry-run matters as much as detection: until now a template could only be tested
by saving it and doing a real upload, so a wrong number was discovered as a
failed import rather than as a red field in a form.
"""
import os

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile

from app.config import settings
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.format_wizard import (
    CandidateOut,
    DetectResponse,
    DryRunRequest,
    DryRunResponse,
    GridPreview,
    SpecPreview,
)
from app.services.parser.ai_layout import detect_layout_full
from app.services.parser.dynamic_parser import DynamicParser
from app.services.parser.grid import SUPPORTED_EXTENSIONS, is_supported, open_grid

router = APIRouter(prefix="/api/format-wizard", tags=["format-wizard"])

PREVIEW_ROWS = 40
PREVIEW_COLS = 26
SAMPLE_ROWS = 5


def _safe_token(name: str) -> str:
    """Uploaded names are attacker-controlled; keep only a bare file name."""
    import re
    base = os.path.basename((name or "").replace("\\", "/")).strip()
    base = re.sub(r'[<>:"|?*\x00-\x1f]', "_", base).lstrip(".")
    return (base or "sample")[:180]


def _resolve(token: str) -> str:
    """Map a file token to a path inside the upload directory, never outside."""
    path = os.path.join(settings.UPLOAD_DIR, _safe_token(token))
    if not os.path.exists(path):
        raise HTTPException(400, "找不到樣本檔，請重新上傳")
    return path


def _preview(grid) -> GridPreview:
    rows: list[list[str | None]] = []
    for r in range(1, min(PREVIEW_ROWS, grid.n_rows) + 1):
        row: list[str | None] = []
        for c in range(1, PREVIEW_COLS + 1):
            v = grid.cell(r, c)
            row.append(None if v is None else str(v))
        rows.append(row)
    return GridPreview(
        rows=rows, nRows=grid.n_rows, nCols=grid.n_cols,
        sheets=grid.sheets, sheetUsed=grid.sheet_used,
        encoding=grid.encoding, delimiter=grid.delimiter,
    )


def _template_from(detection, grid, file_name: str) -> dict:
    """Turn detected candidates into a payload the format endpoints accept."""
    v = detection.value
    template = {
        "format_name": os.path.splitext(file_name)[0][:100],
        "header_row": v("header_row"),
        "id_header_row": v("id_header_row"),
        "data_start_row": v("data_start_row"),
        "lower_limit_row": v("lower_limit_row"),
        "upper_limit_row": v("upper_limit_row"),
        "unit_row": v("unit_row"),
        "electrical_start_col": v("electrical_start_col"),
        # Left unset when nothing could be resolved, rather than defaulted to
        # "column": proposing a source the file cannot supply hides the fact
        # that this is the one decision the user has to make.
        "wafer_id_source": v("wafer_id_source"),
        "wafer_id_col": v("wafer_id_col"),
        "wafer_id_label": v("wafer_id_label"),
        "bin_col": v("bin_col"),
        "x_coord_col": v("x_coord_col"),
        "y_coord_col": v("y_coord_col"),
        "product_id_cell": v("product_id_cell"),
        "product_id_col": v("product_id_col"),
        "lot_id_cell": v("lot_id_cell"),
        "lot_id_col": v("lot_id_col"),
        "sheet_selector": grid.sheet_used if grid.sheet_used != "-" else None,
        "text_delimiter": grid.delimiter,
    }
    return {k: val for k, val in template.items() if val is not None}


@router.post("/detect", response_model=DetectResponse)
async def detect(
    file: UploadFile = File(...),
    use_ai: bool = Form(True),
    verify: bool = Form(False),
    sheet: str = Form(""),
    user: User = Depends(get_current_user),
):
    """Analyse a sample file and propose a template.

    `use_ai` adds the on-premise model pass for the semantic fields; `verify`
    additionally asks a second model family and reports mismatches. Verify is
    off by default — measured on our sample set it produced only false alarms.
    """
    if not is_supported(file.filename or ""):
        raise HTTPException(
            400, "不支援此檔案格式，請上傳 %s" % "、".join(SUPPORTED_EXTENSIONS))

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
    token = _safe_token(file.filename)
    path = os.path.join(settings.UPLOAD_DIR, token)
    with open(path, "wb") as out:
        import shutil
        shutil.copyfileobj(file.file, out)

    try:
        grid = open_grid(path, sheet_selector=sheet or None)
    except Exception as exc:  # noqa: BLE001 — report, don't 500
        raise HTTPException(400, "檔案讀取失敗：%s" % exc)

    if grid.n_rows == 0:
        raise HTTPException(400, "檔案沒有可讀取的內容")

    detection, conflicts = detect_layout_full(
        grid, use_ai=use_ai, verify=verify, user_id=user.id)

    return DetectResponse(
        fileToken=token,
        fileName=file.filename or token,
        preview=_preview(grid),
        fields={k: (CandidateOut(**c.as_dict()) if c else None)
                for k, c in detection.fields.items()},
        warnings=detection.warnings,
        missing=detection.missing,
        conflicts=conflicts,
        template=_template_from(detection, grid, file.filename or token),
    )


@router.get("/preview", response_model=GridPreview)
def preview(file_token: str, sheet: str = "",
            user: User = Depends(get_current_user)):
    """Re-read a stored sample, optionally on a different worksheet."""
    grid = open_grid(_resolve(file_token), sheet_selector=sheet or None)
    return _preview(grid)


@router.post("/dry-run", response_model=DryRunResponse)
def dry_run(req: DryRunRequest, user: User = Depends(get_current_user)):
    """Parse the sample with a draft template and report what came out.

    Never raises for a bad template — a wrong number is a normal state in this
    screen, so the failure is returned as data for the form to display.
    """
    path = _resolve(req.file_token)
    draft = req.template.model_dump()

    required = ("header_row", "data_start_row", "electrical_start_col")
    absent = [f for f in required if not draft.get(f)]
    if absent:
        return DryRunResponse(ok=False, error="尚未設定：%s" % "、".join(absent))
    source = draft.get("wafer_id_source")
    if not source:
        # Detection leaves this unset when the file carries no wafer id at all,
        # which is a decision only the user can make.
        return DryRunResponse(
            ok=False,
            error="請先選擇片號來源（欄位 / 儲存格 / 標籤 / 檔名 / 整檔單一片）")
    if source == "column" and not draft.get("wafer_id_col"):
        return DryRunResponse(ok=False, error="片號來源為「欄位」時必須指定 WAFER ID 欄")

    kwargs = dict(draft)
    kwargs.pop("format_name", None)
    # The parser needs limit rows; a template without them still parses, it just
    # yields no spec limits.
    kwargs.setdefault("lower_limit_row", draft.get("lower_limit_row") or 1)
    kwargs.setdefault("upper_limit_row", draft.get("upper_limit_row") or 1)
    kwargs["lower_limit_row"] = draft.get("lower_limit_row") or 1
    kwargs["upper_limit_row"] = draft.get("upper_limit_row") or 1
    kwargs["bin_col"] = draft.get("bin_col") or 1

    try:
        parser = DynamicParser(vendor_code=req.vendor_code, **kwargs)
        result = parser.parse(path)
    except Exception as exc:  # noqa: BLE001 — surfaced in the form
        return DryRunResponse(ok=False, error="解析失敗：%s" % exc)

    sample: list[dict] = []
    for wafer in result.wafers:
        for die in wafer.dies[:SAMPLE_ROWS - len(sample)]:
            sample.append({
                "waferId": wafer.wafer_id, "bin": die.bin,
                "x": die.x_coord, "y": die.y_coord,
                **{k: v for k, v in list(die.electrical.items())[:8]},
            })
        if len(sample) >= SAMPLE_ROWS:
            break

    issues: list[str] = []
    wafer_col = draft.get("wafer_id_col")
    elec_col = draft.get("electrical_start_col")
    if (draft.get("wafer_id_source", "column") == "column"
            and wafer_col and elec_col and wafer_col >= elec_col):
        # Structurally impossible: the id columns sit before the measurements.
        # Pointing the wafer id into the electrical block is what produced
        # wafer ids like "1.4728" — an electrical reading shown as an id.
        issues.append(
            "片號欄（第 %d 欄）位於電性資料區（第 %d 欄起）之內，讀到的會是量測值而非片號"
            % (wafer_col, elec_col))
    if not result.wafers:
        issues.append("解析後沒有任何晶圓資料，請確認資料起始行與片號來源")
    if not result.param_names:
        issues.append("沒有讀到任何電性參數名稱，請確認標題行與電性起始欄")
    if result.param_names and all(
            s.lower_limit is None and s.upper_limit is None for s in result.cp_specs):
        issues.append("所有參數都沒有規格上下限，請確認上下限行號")
    if len(result.wafers) > 60:
        issues.append("偵測到 %d 片晶圓，數量異常，片號欄可能指錯" % len(result.wafers))
    if not result.product_id:
        issues.append("沒有讀到產品型號")
    if not result.lot_id:
        issues.append("沒有讀到批號")

    return DryRunResponse(
        ok=True,
        waferCount=len(result.wafers),
        dataRows=result.total_rows,
        paramNames=result.param_names,
        waferIds=[w.wafer_id for w in result.wafers][:50],
        productId=result.product_id or None,
        lotId=result.lot_id or None,
        specs=[SpecPreview(param=s.param_name, lower=s.lower_limit,
                           upper=s.upper_limit, unit=s.unit)
               for s in result.cp_specs[:40]],
        sampleRows=sample,
        issues=issues,
    )

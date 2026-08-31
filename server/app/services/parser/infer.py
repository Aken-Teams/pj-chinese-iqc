"""Turn a clicked cell into a template setting.

The wizard first asked people to choose between five wafer-id "sources" and
then, for most of them, to write a regular expression. Both are our internal
model leaking out: the people configuring this already found row and column
numbers unintuitive. So the UI now asks one question — *where is the wafer id?*
— and this module works out what that click means.

Given a position it returns concrete options, each with the value it would
actually produce, so the choice is made by reading real values rather than by
understanding anchors and capture groups.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Optional

from .grid import Grid
from .measure import parse_measure

# Splitting on these turns "H2XR46.1-03" into ["H2XR46.1", "03"], which is what
# lets the UI offer "just the 03" without anyone writing a pattern.
# CJK punctuation is in the class because the 無錫 exports separate their
# file-name fields with it: "供应商：新洁能，型号NCETSG340KAA，批号FA5Z-3372".
_SEPARATORS = r"[-_/\\|,;:\s，、：；。]+"
_LABEL_SEARCH_COLS = 4


@dataclass
class InferOption:
    """One way to read the clicked cell."""
    key: str
    label: str
    preview: str
    fields: dict
    recommended: bool = False
    note: str = ""


@dataclass
class InferResult:
    cell_value: str
    row: int
    col: int
    in_data_region: bool
    label_text: Optional[str] = None
    options: list[InferOption] = field(default_factory=list)

    def as_dict(self) -> dict:
        return {
            "cellValue": self.cell_value,
            "row": self.row,
            "col": self.col,
            "inDataRegion": self.in_data_region,
            "labelText": self.label_text,
            "options": [
                {"key": o.key, "label": o.label, "preview": o.preview,
                 "fields": o.fields, "recommended": o.recommended, "note": o.note}
                for o in self.options
            ],
        }


def _segments(value: str) -> list[str]:
    return [p for p in re.split(_SEPARATORS, value.strip()) if p]


def _escape(text: str) -> str:
    return re.escape(text)


def _find_label(grid: Grid, row: int, col: int) -> tuple[Optional[str], Optional[int]]:
    """Nearest text cell to the left that reads like a label rather than data."""
    for c in range(col - 1, max(0, col - _LABEL_SEARCH_COLS), -1):
        v = grid.cell(row, c)
        if isinstance(v, str) and v.strip() and parse_measure(v).value is None:
            return v.strip(), c
    return None, None


def _trailing_number_pattern(value: str) -> Optional[tuple[str, str]]:
    """Pattern capturing the final numeric run, plus what it yields.

    "H2XR46.1-03" -> (r"-(\\d+)$", "03"); ",001" -> (r"(\\d+)", "001").
    """
    m = re.search(r"(.*?)(" + _SEPARATORS + r")(\d+)\s*$", value)
    if m:
        sep = m.group(2)
        return (_escape(sep) + r"(\d+)$", m.group(3))
    m = re.search(r"(\d+)\s*$", value)
    if m and m.group(1) != value.strip():
        return (r"(\d+)$", m.group(1))
    return None


def _leading_part_pattern(value: str) -> Optional[tuple[str, str]]:
    """Pattern keeping everything before the final separated segment.

    This is what strips the wafer suffix out of 世界先进's LOT ID cell so a
    lot's wafers stay in one lot.
    """
    m = re.search(r"^(.*?)(" + _SEPARATORS + r")(\S+)\s*$", value)
    if not m or not m.group(1):
        return None
    return (r"^(.+)" + _escape(m.group(2)) + r".+$", m.group(1))


def infer_wafer_id(grid: Grid, row: int, col: int,
                   data_start_row: Optional[int] = None) -> InferResult:
    """Work out what clicking (row, col) means for the wafer id."""
    raw = grid.cell(row, col)
    value = "" if raw is None else str(raw).strip()
    in_data = bool(data_start_row and row >= data_start_row)
    label, _label_col = _find_label(grid, row, col)
    result = InferResult(cell_value=value, row=row, col=col,
                         in_data_region=in_data, label_text=label)
    if not value:
        return result

    if in_data:
        # Inside the data block a click means "this column holds the id".
        result.options.append(InferOption(
            key="column", label="每列都有片號（用這一欄）", preview=value,
            fields={"wafer_id_source": "column", "wafer_id_col": col,
                    "wafer_id_cell": None, "wafer_id_label": None,
                    "wafer_id_pattern": None},
            recommended=True,
            note="這一欄的每一列都是片號"))
        trailing = _trailing_number_pattern(value)
        if trailing:
            pattern, preview = trailing
            result.options.append(InferOption(
                key="column_trim", label=f"只取「{preview}」", preview=preview,
                fields={"wafer_id_source": "column", "wafer_id_col": col,
                        "wafer_id_cell": None, "wafer_id_label": None,
                        "wafer_id_pattern": pattern},
                note="去掉批號前綴，只留片號"))
        return result

    # Above the data block: a metadata cell. Anchoring on a neighbouring label
    # survives the row moving between files, so it is preferred when available.
    base_fields = {"wafer_id_source": "cell", "wafer_id_col": None,
                   "wafer_id_cell": f"{row},{col}", "wafer_id_label": None}
    if label:
        base_fields = {"wafer_id_source": "label", "wafer_id_col": None,
                       "wafer_id_cell": None, "wafer_id_label": label}

    trailing = _trailing_number_pattern(value)
    if trailing:
        pattern, preview = trailing
        result.options.append(InferOption(
            key="trim", label=f"只取「{preview}」", preview=preview,
            fields={**base_fields, "wafer_id_pattern": pattern},
            recommended=True,
            note="這格同時含批號，只取片號那一段"))
    result.options.append(InferOption(
        key="whole", label="整格都是片號", preview=value,
        fields={**base_fields, "wafer_id_pattern": None},
        recommended=not trailing))

    if label:
        # Offer the brittle-but-literal alternative too, in case the label text
        # is not stable across this vendor's files.
        result.options.append(InferOption(
            key="fixed", label=f"固定位置（第 {row} 列第 {col} 欄）", preview=value,
            fields={"wafer_id_source": "cell", "wafer_id_col": None,
                    "wafer_id_cell": f"{row},{col}", "wafer_id_label": None,
                    "wafer_id_pattern": trailing[0] if trailing else None},
            note="不依標籤，直接記住位置"))
    return result


def infer_metadata(grid: Grid, row: int, col: int, role: str,
                   data_start_row: Optional[int] = None) -> InferResult:
    """Same idea for the product / lot identifiers.

    `role` is "product" or "lot" and only selects which template fields the
    options write to.
    """
    prefix = "product_id" if role == "product" else "lot_id"
    raw = grid.cell(row, col)
    value = "" if raw is None else str(raw).strip()
    in_data = bool(data_start_row and row >= data_start_row)
    label, _ = _find_label(grid, row, col)
    result = InferResult(cell_value=value, row=row, col=col,
                         in_data_region=in_data, label_text=label)
    if not value:
        return result

    def opt(key, label_text, preview, fields, recommended=False, note=""):
        result.options.append(InferOption(key, label_text, preview, fields,
                                          recommended, note))

    blank = {f"{prefix}_col": None, f"{prefix}_cell": None,
             f"{prefix}_label": None, f"{prefix}_pattern": None}

    if in_data:
        opt("column", "每列都有（用這一欄）", value,
            {**blank, f"{prefix}_col": col}, recommended=True)
        return result

    base = ({**blank, f"{prefix}_label": label} if label
            else {**blank, f"{prefix}_cell": f"{row},{col}"})

    leading = _leading_part_pattern(value)
    if role == "lot" and leading:
        pattern, preview = leading
        opt("trim_suffix", f"去掉尾段，取「{preview}」", preview,
            {**base, f"{prefix}_pattern": pattern}, recommended=True,
            note="批號含片號後綴時，去掉後綴才不會把同一批拆開")

    opt("whole", "整格都是", value, {**base}, recommended=not (role == "lot" and leading))

    # A path-like value: offer just the leaf, which is where 天狼芯 hides its
    # model ("...\\S0804NA\\S0804NA-650V(P)-V3.tst").
    if re.search(r"[\\/]", value):
        # A path: its leaf is the useful part, so the whole-cell reading stops
        # being the recommendation.
        for existing in result.options:
            existing.recommended = False
        leaf = re.split(r"[\\/]", value)[-1]
        leaf_no_ext = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", leaf)
        opt("leaf", f"只取檔名部分「{leaf_no_ext}」", leaf_no_ext,
            {**base, f"{prefix}_pattern": r"([^\\/]+?)(?:\.[A-Za-z0-9]{1,5})?$"},
            recommended=True, note="這格是路徑，只取最後一段")
    elif re.search(r"\.[A-Za-z0-9]{1,5}$", value):
        stem = re.sub(r"\.[A-Za-z0-9]{1,5}$", "", value)
        opt("stem", f"去掉副檔名「{stem}」", stem,
            {**base, f"{prefix}_pattern": r"^([^.]+)"}, note="去掉檔案副檔名")
    return result


def infer_from_filename(file_name: str, role: str) -> list[InferOption]:
    """Options for pulling the product / lot out of the file name.

    Used only when the file's contents carry nothing, which is the whole point
    of the fallback: vendors whose files state their model are never asked to
    rename anything.
    """
    prefix = "product_id" if role == "product" else "lot_id"
    field_name = f"{prefix}_filename_pattern"
    import os
    stem = os.path.splitext(os.path.basename(file_name))[0]
    out: list[InferOption] = []

    # Labelled segments, as used by the 無錫 exports:
    #   "供应商：新洁能，型号NCETSG340KAA, 批号FA5Z-3372，号001"
    keywords = ((r"型\s*号|型\s*號|model", "product"),
                (r"批\s*号|批\s*號|lot", "lot"))
    for kw, kw_role in keywords:
        if kw_role != role:
            continue
        pattern = r"(?:" + kw + r")\s*[:：]?\s*([A-Za-z0-9][\w.\-]*)"
        m = re.search(pattern, stem)
        if m:
            out.append(InferOption(
                key="labelled", label=f"從檔名的標記取「{m.group(1)}」",
                preview=m.group(1), fields={field_name: pattern},
                recommended=True, note="檔名有「型号 / 批号」標記"))

    for seg in _segments(stem):
        # Skip anything carrying CJK: those are the field labels ("型号…"),
        # not the model code itself.
        if re.search(r"[一-鿿]", seg):
            continue
        if len(seg) >= 3 and re.search(r"[A-Za-z]", seg) and re.search(r"\d", seg):
            out.append(InferOption(
                key=f"seg_{seg}", label=f"取「{seg}」", preview=seg,
                fields={field_name: r"(" + _escape(seg) + r")"},
                note="固定字串比對；換型號就要改"))
    return out[:6]

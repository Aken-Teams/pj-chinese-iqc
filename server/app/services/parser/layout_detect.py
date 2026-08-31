"""Rule-based layout detection for CP files (the L1 stage).

Derived from a survey of every real sample we hold: six 無錫 suppliers plus
徐州's production dump. Two things that survey established shape this module:

1. Structure alone finds the data block and the column roles reliably.
2. Structure alone CANNOT tell a spec-limit row from a row that merely looks
   like one. `TEST NUMBER`, `Test#`, `Average`, `STDEV`, `MinData`/`MaxData` are
   all sparse numeric rows sitting above the data that pair up under a
   greater-than test exactly the way LOWER/UPPER limits do. Four of eight files
   were mis-detected that way. Only the label text separates them, so the row
   hints below are load-bearing, not a nicety.

Every field comes back as a `Candidate` carrying a confidence and a plain
sentence of evidence, so the template UI can show why a guess was made and
flag the low-confidence ones instead of silently committing to them.
"""
from __future__ import annotations

import re
from collections import Counter
from dataclasses import dataclass, field
from typing import Any, Optional

from .grid import Grid
from .measure import parse_measure

MAX_SCAN_ROWS = 120      # header/metadata region worth searching
MAX_SCAN_COLS = 60
_MIN_DATA_RUN = 4        # consecutive similar rows before we call it "data"
# How far above the data block to look for headers and limit rows. 天狼芯
# stacks six Bias rows plus a statistics block between its header (r15) and
# its data (r37), so a short lookback misses the header entirely.
HEADER_LOOKBACK = 32


# --- label vocabulary ---------------------------------------------------
# Written as regexes over a normalised (lowercased, punctuation-stripped) form.
def _rx(*parts: str) -> re.Pattern:
    return re.compile("|".join(parts))


UPPER_LIMIT_HINTS = _rx(
    r"upperlimit", r"maxlimit", r"specmax", r"^max$", r"^limitu$", r"^usl$",
    r"上限", r"規格上限", r"规格上限", r"最大值?限",
)
LOWER_LIMIT_HINTS = _rx(
    r"lowerlimit", r"minlimit", r"specmin", r"^min$", r"^limitl$", r"^lsl$",
    r"下限", r"規格下限", r"规格下限", r"最小值?限",
)
# Rows that mimic limit rows and must never be chosen as one.
NOT_A_LIMIT_HINTS = _rx(
    r"testnumber", r"test#", r"testno", r"measureitem", r"itemno",
    r"average", r"^ave$", r"^avg$", r"stdev", r"stdef", r"sigma",
    r"mindata", r"maxdata", r"^count$", r"^sum$", r"yield",
    r"平均", r"標準差", r"标准差", r"測項編號", r"测项编号",
)
UNIT_HINTS = _rx(r"^unit$", r"limitunit", r"^units$", r"單位", r"单位")
# Auxiliary rows that sit among the header rows but never name the parameters.
NOT_A_HEADER_HINTS = _rx(r"^bias", r"limitunit", r"^unit", r"^testnumber",
                         r"^measureitem", r"偏壓", r"偏压")
PARAM_HEADER_HINTS = _rx(r"itemname", r"parametername", r"^parameter$", r"^item$",
                         r"測項", r"测项", r"參數名", r"参数名")
WAFER_HINTS = _rx(r"wafer", r"wfr", r"^slice$", r"片號", r"片号", r"晶圓", r"晶圆")
BIN_HINTS = _rx(r"^bin", r"bincode", r"^hbin$", r"^sbin$", r"分箱", r"分選", r"分选")
X_HINTS = _rx(r"^x$", r"^xcord$", r"^xcoord$", r"xaxis", r"^xpos$", r"x座標", r"x坐标")
Y_HINTS = _rx(r"^y$", r"^ycord$", r"^ycoord$", r"yaxis", r"^ypos$", r"y座標", r"y坐标")
LOT_HINTS = _rx(r"^lotid$", r"lotname", r"lotnumber", r"^lot$", r"批號", r"批号")
PRODUCT_HINTS = _rx(r"productid", r"devicename", r"^device$", r"^product$",
                    r"partname", r"型號", r"型号", r"品名")


def _norm(s: Any) -> str:
    """Fold a label for matching: lowercase, strip spaces and separators."""
    return re.sub(r"[\s:：#\-_.,，、()（）]+", "", str(s)).lower()


@dataclass
class Candidate:
    """One detected field, with why."""
    value: Any
    confidence: float
    evidence: str
    source: str = "rule"     # rule | ai | user

    def as_dict(self) -> dict:
        return {"value": self.value, "confidence": round(self.confidence, 2),
                "evidence": self.evidence, "source": self.source}


@dataclass
class LayoutDetection:
    fields: dict[str, Optional[Candidate]] = field(default_factory=dict)
    warnings: list[str] = field(default_factory=list)
    missing: list[str] = field(default_factory=list)

    def value(self, name: str) -> Any:
        c = self.fields.get(name)
        return c.value if c else None

    def as_dict(self) -> dict:
        return {
            "fields": {k: (v.as_dict() if v else None) for k, v in self.fields.items()},
            "warnings": self.warnings,
            "missing": self.missing,
        }


# --- row/column primitives ---------------------------------------------
def _is_text(v: Any) -> bool:
    """A cell that is genuinely a label, not a number.

    The isinstance check alone is not enough: in a CSV or .txt every cell is a
    string, so "5.4734E1" would otherwise count as a label and let a statistics
    row masquerade as the header row.
    """
    return isinstance(v, str) and parse_measure(v).value is None


def _row_texts(grid: Grid, row: int, max_col: int) -> list[str]:
    """Every label cell in a row. Labels are not always in column A — 徐州's
    JJW dump keeps `LOWER LIMIT` in column 14."""
    out = []
    for c in range(1, max_col + 1):
        v = grid.cell(row, c)
        if _is_text(v):
            out.append(v)
    return out


def _row_matches(grid: Grid, row: int, max_col: int, pattern: re.Pattern) -> Optional[str]:
    for t in _row_texts(grid, row, max_col):
        if pattern.search(_norm(t)):
            return t
    return None


def _signature(grid: Grid, row: int, max_col: int) -> str:
    out = []
    for c in range(1, max_col + 1):
        v = grid.cell(row, c)
        if v is None:
            out.append("-")
        else:
            out.append("n" if parse_measure(v).value is not None else "s")
    return "".join(out)


def _numeric_ratio(sig: str) -> float:
    filled = [ch for ch in sig if ch != "-"]
    return (sig.count("n") / len(filled)) if filled else 0.0


# --- detection stages ---------------------------------------------------
def _detect_data_start(grid: Grid, sigs: list[str], max_col: int) -> Optional[Candidate]:
    """Longest run of rows sharing a numeric-dominant type signature.

    Using the longest run (not the first) is what keeps the statistics block
    that sits above the data — 世界先进 rows 25-28 — from winning.
    """
    best_len, best_at = 0, None
    r = 1
    while r <= len(sigs):
        if _numeric_ratio(sigs[r - 1]) < 0.5:
            r += 1
            continue
        run = r + 1
        while run <= len(sigs) and _numeric_ratio(sigs[run - 1]) >= 0.5 and \
                _similarity(sigs[run - 1], sigs[r - 1]) > 0.85:
            run += 1
        if run - r > best_len:
            best_len, best_at = run - r, r
        r = max(run, r + 1)
    if best_at is None or best_len < _MIN_DATA_RUN:
        return None
    conf = 0.95 if best_len >= 20 else 0.8 if best_len >= 8 else 0.6
    return Candidate(best_at, conf,
                     f"第 {best_at} 列起有 {best_len} 列型態一致的數值資料")


def _similarity(a: str, b: str) -> float:
    n = max(len(a), len(b))
    if not n:
        return 0.0
    return sum(x == y for x, y in zip(a, b)) / n


def _detect_limit_rows(grid: Grid, sigs: list[str], data_start: int,
                       max_col: int) -> tuple[Optional[Candidate], Optional[Candidate], list[str]]:
    """Find the spec upper/lower rows above the data block.

    Labelled rows win outright. Only if no label is found do we fall back to
    comparing sparse numeric rows pairwise — and rows whose label marks them as
    a test index or a statistic are excluded from that fallback entirely.
    """
    warnings: list[str] = []
    window = range(max(1, data_start - HEADER_LOOKBACK), data_start)

    labelled_upper = labelled_lower = None
    excluded: set[int] = set()
    for r in window:
        if _row_matches(grid, r, max_col, NOT_A_LIMIT_HINTS):
            excluded.add(r)
            continue
        if labelled_upper is None:
            hit = _row_matches(grid, r, max_col, UPPER_LIMIT_HINTS)
            if hit:
                labelled_upper = Candidate(r, 0.97, f'第 {r} 列標示「{hit}」')
                continue
        if labelled_lower is None:
            hit = _row_matches(grid, r, max_col, LOWER_LIMIT_HINTS)
            if hit:
                labelled_lower = Candidate(r, 0.97, f'第 {r} 列標示「{hit}」')

    if labelled_upper and labelled_lower:
        return labelled_upper, labelled_lower, warnings

    # Structural fallback: pair sparse numeric rows and let magnitude decide.
    cands = [r for r in window
             if r not in excluded
             and 0 < sigs[r - 1].count("n") < max_col * 0.9
             and _numeric_ratio(sigs[r - 1]) > 0.3]
    best = None
    for i, a in enumerate(cands):
        for b in cands[i + 1:]:
            gt = lt = 0
            for c in range(1, max_col + 1):
                va = parse_measure(grid.cell(a, c)).value
                vb = parse_measure(grid.cell(b, c)).value
                if va is None or vb is None or va == vb:
                    continue
                gt += va > vb
                lt += va < vb
            total = gt + lt
            if total >= 3 and max(gt, lt) / total > 0.85:
                upper, lower = (a, b) if gt > lt else (b, a)
                if best is None or total > best[2]:
                    best = (upper, lower, total)

    if best:
        upper_row, lower_row, votes = best
        conf = 0.55 if votes < 6 else 0.65
        note = f"依 {votes} 個欄位的數值大小推斷（無標籤可佐證）"
        upper = labelled_upper or Candidate(upper_row, conf, note)
        lower = labelled_lower or Candidate(lower_row, conf, note)
        warnings.append("上下限行沒有明確標籤，請確認是否為規格值而非統計值")
        return upper, lower, warnings

    if labelled_upper or labelled_lower:
        warnings.append("只找到單邊規格限值行")
    return labelled_upper, labelled_lower, warnings


def _header_candidates(grid: Grid, data_start: int, max_col: int) -> list[tuple[int, int]]:
    """Rows above the data ranked by how many distinct labels they carry.

    Computed without knowing the electrical start column, because that column
    can only be located once the id columns are known — and those are named in
    the header.
    """
    out = []
    for r in range(max(1, data_start - HEADER_LOOKBACK), data_start):
        labels = {_norm(t) for t in _row_texts(grid, r, max_col)}
        if len(labels) < 2:
            continue
        # Bias / Unit / Test-number rows carry one entry per parameter and can
        # out-count the real header row (天狼芯 has six Bias rows), so drop them.
        if _row_matches(grid, r, max_col, NOT_A_HEADER_HINTS):
            continue
        score = len(labels)
        if _row_matches(grid, r, max_col, PARAM_HEADER_HINTS):
            score += 100  # an explicit "Parameter Name" label settles it
        out.append((r, score))
    out.sort(key=lambda x: (-x[1], -x[0]))
    return out


def _label_id_columns(grid: Grid, header_rows: list[int],
                      max_col: int) -> dict[str, tuple[int, int, str]]:
    """Locate wafer/bin/X/Y columns by their header text, scanning full width."""
    found: dict[str, tuple[int, int, str]] = {}
    for hrow in header_rows:
        for c in range(1, max_col + 1):
            v = grid.cell(hrow, c)
            if not _is_text(v):
                continue
            n = _norm(v)
            for key, pat in (("wafer_id_col", WAFER_HINTS), ("bin_col", BIN_HINTS),
                             ("x_coord_col", X_HINTS), ("y_coord_col", Y_HINTS)):
                if key not in found and pat.search(n):
                    found[key] = (c, hrow, str(v))
    return found


def _detect_electrical_start(grid: Grid, upper: Optional[Candidate],
                             lower: Optional[Candidate], max_col: int,
                             after_col: int = 0) -> Optional[Candidate]:
    """First column past the id block that carries a spec limit.

    `after_col` matters because id columns can carry limits too: 世界先进 gives
    Site#/Bin#/X/Y their own Max/Min values, so "first column with a limit"
    lands on column 2 instead of the real electrical start at column 6.
    Limit-less columns after the id block (东部高科's two PSCAN columns) are
    still skipped, which is the judgement a human makes by hand today.
    """
    rows = [c.value for c in (upper, lower) if c]
    if not rows:
        return None
    for c in range(after_col + 1, max_col + 1):
        if any(parse_measure(grid.cell(r, c)).value is not None for r in rows):
            why = f"第 {c} 欄是第一個有規格限值的欄位"
            if after_col:
                why += f"（已跳過第 {after_col} 欄以前的 ID 欄位）"
            return Candidate(c, 0.85, why)
    return None


def _split_header_rows(grid: Grid, candidates: list[tuple[int, int]],
                       elec_start: Optional[int],
                       max_col: int) -> tuple[Optional[Candidate], Optional[Candidate]]:
    """Separate the parameter-name row from an id-column header row.

    东部高科 splits them: r10 names the parameters (all at/after the electrical
    start), r14 names WAFER ID/BIN/XCORD/YCORD (all before it). Most vendors use
    one row for both, in which case only the parameter row comes back.
    """
    if not candidates:
        return None, None
    if not elec_start:
        r, score = candidates[0]
        return Candidate(r, 0.6, f"第 {r} 列含 {score} 個標題文字"), None

    param_row = param_score = None
    id_row = id_score = None
    for r, _ in candidates:
        after = {_norm(grid.cell(r, c)) for c in range(elec_start, max_col + 1)
                 if _is_text(grid.cell(r, c))}
        before = {_norm(grid.cell(r, c)) for c in range(1, elec_start)
                  if _is_text(grid.cell(r, c))}
        if len(after) >= 2 and (param_score is None or len(after) > param_score):
            param_row, param_score = r, len(after)
        # Dominated by labels before the electrical block, rather than free of
        # them after it: 东部高科's id header row carries one stray cell out to
        # the right, and demanding a completely empty tail handed the role to a
        # metadata row instead.
        if len(before) >= 2 and len(before) > len(after) \
                and (id_score is None or len(before) > id_score):
            id_row, id_score = r, len(before)

    param = None
    if param_row:
        hint = _row_matches(grid, param_row, max_col, PARAM_HEADER_HINTS)
        conf = 0.95 if hint else 0.8
        why = (f'第 {param_row} 列標示「{hint}」，' if hint else "")
        param = Candidate(param_row, conf, f"{why}含 {param_score} 個相異參數名稱")
    ident = None
    if id_row and id_row != param_row:
        ident = Candidate(id_row, 0.75,
                          f"第 {id_row} 列只在電性欄之前有標題文字（ID 欄標題）")
    return param, ident


def _column_profile(grid: Grid, col: int, data_start: int, sample_to: int) -> dict:
    vals = [grid.cell(r, col) for r in range(data_start, sample_to + 1)]
    filled = [v for v in vals if v is not None]
    nums = [parse_measure(v).value for v in filled]
    nums = [n for n in nums if n is not None]
    runs = 0
    prev = object()
    for v in filled:
        if v != prev:
            runs += 1
            prev = v
    return {
        "n": len(filled),
        "distinct": len(set(map(str, filled))),
        "runs": runs,
        "all_numeric": len(nums) == len(filled) and bool(filled),
        "all_int": bool(nums) and all(float(x).is_integer() for x in nums),
        "nums": nums,
    }


def _detect_id_columns(grid: Grid, data_start: int, elec_start: Optional[int],
                       labelled: dict[str, tuple[int, int, str]],
                       max_col: int) -> dict[str, Optional[Candidate]]:
    """Wafer / bin / X / Y columns: labelled ones first, then structure."""
    limit = elec_start - 1 if elec_start else min(max_col, 12)
    sample_to = min(grid.n_rows, data_start + 400)
    out: dict[str, Optional[Candidate]] = {
        "wafer_id_col": None, "bin_col": None,
        "x_coord_col": None, "y_coord_col": None,
    }
    for key, (col, hrow, label) in labelled.items():
        # A label is a claim, not proof: 禾纳 writes "Wafer number" as a
        # metadata row above the data, and taking it as a column header pointed
        # the wafer id at the die-index column. Require the data underneath to
        # behave like the role before trusting the label.
        if key == "wafer_id_col":
            p = _column_profile(grid, col, data_start, sample_to)
            if p["n"] >= 5 and p["distinct"] / p["n"] > 0.5:
                continue  # every value distinct -> an index, not a wafer id
        out[key] = Candidate(col, 0.95, f'第 {hrow} 列第 {col} 欄標題為「{label}」')

    # Structural pass for whatever the labels did not cover.
    for c in range(1, limit + 1):
        p = _column_profile(grid, c, data_start, sample_to)
        if p["n"] < 5:
            continue
        if out["wafer_id_col"] is None and not p["all_numeric"] \
                and p["distinct"] <= 40 and p["distinct"] / p["n"] < 0.3 \
                and p["runs"] <= p["distinct"] * 2:
            out["wafer_id_col"] = Candidate(
                c, 0.6, f"第 {c} 欄只有 {p['distinct']} 種值且連續分段，像片號")
        if out["bin_col"] is None and p["all_int"] and 0 < p["distinct"] < 30 \
                and p["nums"] and Counter(p["nums"]).most_common(1)[0][0] == 1:
            out["bin_col"] = Candidate(
                c, 0.6, f"第 {c} 欄為小整數且眾數為 1，像 BIN")
    return out


def _detect_metadata(grid: Grid, data_start: int,
                     header_rows: set[int]) -> dict[str, Optional[Candidate]]:
    """Locate the lot / product identifiers.

    The same word means two different things depending on where it sits. In the
    metadata block above the data, `LOT ID:` labels the cell beside it. In the
    header row, `LotID` names a *column* whose values are in the data rows —
    reading the neighbouring cell there returns the next column's heading
    ("ProductID" -> "LotID"), which is how the wizard first reported 徐州's
    product as the literal string "LotID".
    """
    out: dict[str, Optional[Candidate]] = {
        "lot_id_cell": None, "product_id_cell": None,
        "lot_id_col": None, "product_id_col": None,
    }
    for cell_key, col_key, pat, label in (
            ("lot_id_cell", "lot_id_col", LOT_HINTS, "批號"),
            ("product_id_cell", "product_id_col", PRODUCT_HINTS, "產品")):
        done = False
        for r in range(1, min(data_start, MAX_SCAN_ROWS)):
            for c in range(1, 12):
                v = grid.cell(r, c)
                if not _is_text(v) or not pat.search(_norm(v)):
                    continue
                if r in header_rows:
                    sample = grid.cell(data_start, c)
                    out[col_key] = Candidate(
                        c, 0.9,
                        f'{label}：第 {r} 列第 {c} 欄標題為「{v}」'
                        + (f'，資料為「{sample}」' if sample is not None else ""))
                    done = True
                    break
                for cc in range(c + 1, min(c + 6, MAX_SCAN_COLS)):
                    val = grid.cell(r, cc)
                    if val is not None:
                        out[cell_key] = Candidate(
                            f"{r},{cc}", 0.9,
                            f'{label}：第 {r} 列「{v}」右方為「{val}」')
                        done = True
                        break
                if done:
                    break
            if done:
                break
    return out


def _detect_wafer_source(grid: Grid, wafer_col: Optional[Candidate],
                         data_start: int) -> tuple[Candidate, Optional[Candidate], list[str]]:
    """Decide where the wafer id comes from.

    Never invents a column: when nothing is found the caller is told so
    explicitly, because guessing here is how electrical values ended up being
    displayed as wafer ids.
    """
    warnings: list[str] = []
    if wafer_col and wafer_col.confidence >= 0.9:
        return Candidate("column", wafer_col.confidence,
                         "資料列中有片號欄位"), None, warnings

    for label in ("Wafer number", "Wafer ID", "WaferID", "片號", "片号"):
        pos = grid.find_label(label, search_rows=min(data_start + 5, MAX_SCAN_ROWS))
        if pos:
            val = grid.label_value(label, search_rows=min(data_start + 5, MAX_SCAN_ROWS))
            if val is not None:
                return (Candidate("label", 0.9, f'表頭有「{label}」標籤，值為「{val}」'),
                        Candidate(label, 0.9, "以標籤錨定，可容忍列位置浮動"),
                        warnings)

    if wafer_col:
        return Candidate("column", wafer_col.confidence, wafer_col.evidence), None, warnings

    warnings.append(
        "檔案中找不到片號（Wafer ID）。請選擇來源：從檔名擷取、指定儲存格，"
        "或將整份檔案視為單一片。")
    return Candidate(None, 0.0, "檔案內找不到任何片號來源"), None, warnings


# --- entry point --------------------------------------------------------
def detect_layout(grid: Grid) -> LayoutDetection:
    """Infer a VendorFormat descriptor from a sample file."""
    det = LayoutDetection()
    max_col = min(grid.n_cols or MAX_SCAN_COLS, MAX_SCAN_COLS)
    scan_to = min(grid.n_rows, MAX_SCAN_ROWS)
    sigs = [_signature(grid, r, max_col) for r in range(1, scan_to + 1)]

    data = _detect_data_start(grid, sigs, max_col)
    det.fields["data_start_row"] = data
    if not data:
        det.warnings.append("找不到資料區塊，無法自動辨識版面")
        det.missing = ["data_start_row"]
        return det
    data_start = data.value

    upper, lower, warns = _detect_limit_rows(grid, sigs, data_start, max_col)
    det.fields["upper_limit_row"] = upper
    det.fields["lower_limit_row"] = lower
    det.warnings.extend(warns)

    # Header rows are ranked first so the id columns can be named, because the
    # electrical block can only start after the last id column.
    hdr_candidates = _header_candidates(grid, data_start, max_col)
    labelled_cols = _label_id_columns(grid, [r for r, _ in hdr_candidates], max_col)
    after_col = max((c for c, _r, _l in labelled_cols.values()), default=0)

    elec = _detect_electrical_start(grid, upper, lower, max_col, after_col=after_col)
    det.fields["electrical_start_col"] = elec
    elec_start = elec.value if elec else None

    header, id_header = _split_header_rows(grid, hdr_candidates, elec_start, max_col)
    det.fields["header_row"] = header
    det.fields["id_header_row"] = id_header

    unit_row = None
    for r in range(max(1, data_start - HEADER_LOOKBACK), data_start):
        hit = _row_matches(grid, r, max_col, UNIT_HINTS)
        if hit:
            unit_row = Candidate(r, 0.9, f'第 {r} 列標示「{hit}」')
            break
    det.fields["unit_row"] = unit_row

    cols = _detect_id_columns(grid, data_start, elec_start, labelled_cols, max_col)
    det.fields.update(cols)

    source, label, warns = _detect_wafer_source(grid, cols.get("wafer_id_col"), data_start)
    det.fields["wafer_id_source"] = source
    det.fields["wafer_id_label"] = label
    det.warnings.extend(warns)

    header_rows = {c.value for c in (header, id_header) if c}
    det.fields.update(_detect_metadata(grid, data_start, header_rows))

    required = ["data_start_row", "header_row", "electrical_start_col", "bin_col"]
    det.missing = [k for k in required if not det.fields.get(k)]
    if source.value is None:
        det.missing.append("wafer_id_source")
    return det

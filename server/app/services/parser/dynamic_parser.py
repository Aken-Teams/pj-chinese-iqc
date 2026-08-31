"""
Dynamic parser driven by a VendorFormat row from the database.

Any vendor can be parsed as long as their layout is described in 廠商管理
(Vendor Management) — no code change per vendor. The descriptors grew after the
2026-08 survey of real files from 無錫 (six vendors) and 徐州, which showed that
a fixed "wafer id lives in column N" model cannot express most real CP dumps.
See `grid.py` for the file-shape abstraction and `measure.py` for unit parsing.
"""

import os
import re

from .base import BaseParser, ParseResult, ParsedWafer, ParsedDie, ParsedCpSpec
from .grid import Grid, open_grid, parse_cell_ref
from .measure import to_float

# Stop scanning after this many consecutive blank rows. A single blank row in
# the middle of the data used to end the parse silently, quietly dropping every
# row after it; only a sustained run of blanks now means "end of data".
_BLANK_RUN_LIMIT = 25

WAFER_ID_SOURCES = ("column", "cell", "label", "filename", "single")


class DynamicParser(BaseParser):
    """Parser driven by a VendorFormat configuration row."""

    def __init__(self, vendor_code: str, header_row: int, data_start_row: int,
                 lower_limit_row: int | None = None,
                 upper_limit_row: int | None = None,
                 *,
                 electrical_start_col: int, wafer_id_col: int | None = None,
                 bin_col: int = 1,
                 x_coord_col: int | None = None, y_coord_col: int | None = None,
                 product_id_col: int | None = None, lot_id_col: int | None = None,
                 fixed_die_count: int | None = None,
                 product_id_cell: str | None = None,
                 lot_id_cell: str | None = None,
                 wafer_id_source: str = "column",
                 wafer_id_cell: str | None = None,
                 wafer_id_label: str | None = None,
                 wafer_id_pattern: str | None = None,
                 product_id_label: str | None = None,
                 lot_id_label: str | None = None,
                 product_id_pattern: str | None = None,
                 lot_id_pattern: str | None = None,
                 product_id_filename_pattern: str | None = None,
                 lot_id_filename_pattern: str | None = None,
                 id_header_row: int | None = None,
                 unit_row: int | None = None,
                 sheet_selector: str | None = None,
                 param_cols: list | None = None,
                 text_delimiter: str | None = None):
        self.vendor_code = vendor_code
        self.HEADER_ROW = header_row
        self.DATA_START_ROW = data_start_row
        self.LOWER_LIMIT_ROW = lower_limit_row
        self.UPPER_LIMIT_ROW = upper_limit_row
        self.ELECTRICAL_START_COL = electrical_start_col
        self.WAFER_ID_COL = wafer_id_col
        self.BIN_COL = bin_col
        self.X_COORD_COL = x_coord_col
        self.Y_COORD_COL = y_coord_col
        self.PRODUCT_ID_COL = product_id_col
        self.LOT_ID_COL = lot_id_col
        self.FIXED_DIE_COUNT = fixed_die_count
        self.PRODUCT_ID_CELL = parse_cell_ref(product_id_cell)
        self.LOT_ID_CELL = parse_cell_ref(lot_id_cell)

        self.WAFER_ID_SOURCE = (wafer_id_source or "column").strip().lower()
        if self.WAFER_ID_SOURCE not in WAFER_ID_SOURCES:
            self.WAFER_ID_SOURCE = "column"
        self.WAFER_ID_CELL = parse_cell_ref(wafer_id_cell)
        self.WAFER_ID_LABEL = wafer_id_label or None
        self.WAFER_ID_PATTERN = wafer_id_pattern or None
        self.PRODUCT_ID_LABEL = product_id_label or None
        self.LOT_ID_LABEL = lot_id_label or None
        self.PRODUCT_ID_PATTERN = product_id_pattern or None
        self.LOT_ID_PATTERN = lot_id_pattern or None
        self.PRODUCT_ID_FILENAME_PATTERN = product_id_filename_pattern or None
        self.LOT_ID_FILENAME_PATTERN = lot_id_filename_pattern or None
        self.ID_HEADER_ROW = id_header_row
        self.UNIT_ROW = unit_row
        self.SHEET_SELECTOR = sheet_selector or None
        self.PARAM_COLS = list(param_cols) if param_cols else None
        self.TEXT_DELIMITER = text_delimiter or None

    # ------------------------------------------------------------------
    @classmethod
    def from_vendor_format(cls, vendor_code: str, fmt) -> "DynamicParser":
        """Build a parser from a VendorFormat ORM object.

        Every field added after the original schema is read with getattr so a
        stale row (or a lightweight stub in tests) still works.
        """
        g = lambda name: getattr(fmt, name, None)  # noqa: E731
        return cls(
            vendor_code=vendor_code,
            header_row=fmt.header_row,
            data_start_row=fmt.data_start_row,
            lower_limit_row=fmt.lower_limit_row,
            upper_limit_row=fmt.upper_limit_row,
            electrical_start_col=fmt.electrical_start_col,
            wafer_id_col=fmt.wafer_id_col,
            bin_col=fmt.bin_col,
            x_coord_col=fmt.x_coord_col,
            y_coord_col=fmt.y_coord_col,
            product_id_col=fmt.product_id_col,
            lot_id_col=fmt.lot_id_col,
            fixed_die_count=fmt.fixed_die_count,
            product_id_cell=g("product_id_cell"),
            lot_id_cell=g("lot_id_cell"),
            wafer_id_source=g("wafer_id_source") or "column",
            wafer_id_cell=g("wafer_id_cell"),
            wafer_id_label=g("wafer_id_label"),
            wafer_id_pattern=g("wafer_id_pattern"),
            product_id_label=g("product_id_label"),
            lot_id_label=g("lot_id_label"),
            product_id_pattern=g("product_id_pattern"),
            lot_id_pattern=g("lot_id_pattern"),
            product_id_filename_pattern=g("product_id_filename_pattern"),
            lot_id_filename_pattern=g("lot_id_filename_pattern"),
            id_header_row=g("id_header_row"),
            unit_row=g("unit_row"),
            sheet_selector=g("sheet_selector"),
            param_cols=g("param_cols"),
            text_delimiter=g("text_delimiter"),
        )

    # --- helpers -------------------------------------------------------
    @staticmethod
    def _safe_float(val):
        """Numeric value of a cell, unit-bearing strings included.

        Kept as a static method because callers and tests reach for it; the
        real work now lives in measure.to_float so that "200.0mV" and "99.00uA"
        yield numbers instead of None.
        """
        return to_float(val)

    def _open(self, filepath: str, max_rows: int | None = None) -> Grid:
        return open_grid(filepath, sheet_selector=self.SHEET_SELECTOR,
                         delimiter=self.TEXT_DELIMITER, max_rows=max_rows)

    def _param_columns(self, grid: Grid) -> list[int]:
        """Electrical columns, 1-indexed.

        An explicit `param_cols` wins; otherwise scan right from
        ELECTRICAL_START_COL until the header row runs out — the original
        behaviour, kept because most templates rely on it.
        """
        if self.PARAM_COLS:
            return [int(c) for c in self.PARAM_COLS if int(c) >= 1]
        cols = []
        col = self.ELECTRICAL_START_COL
        while True:
            if grid.cell(self.HEADER_ROW, col) is None:
                break
            cols.append(col)
            col += 1
        return cols

    def _param_names(self, grid: Grid, cols: list[int]) -> list[str]:
        return [str(grid.cell(self.HEADER_ROW, c)).strip() for c in cols]

    @staticmethod
    def _refine(value, pattern: str | None, strict: bool = False) -> str:
        """Apply an optional regex to an extracted string; group 1 wins.

        `strict` returns "" when the pattern does not match, instead of the raw
        text. Cell contents are meaningful on their own, so a failed pattern
        there falls back to the value; a FILE NAME is not — without a match,
        "nothing.csv" would become the product code for every such file.
        """
        s = "" if value is None else str(value).strip()
        if not s or not pattern:
            return s
        try:
            m = re.search(pattern, s)
        except re.error:
            return "" if strict else s
        if not m:
            return "" if strict else s
        return (m.group(1) if m.groups() else m.group(0)).strip()

    def _apply_pattern(self, value) -> str:
        """Refine an extracted id with the configured regex.

        Group 1 wins when the pattern has one, else the whole match. This is
        how 世界先进 gets a wafer id: its LOT ID cell reads "H2XR46.1-01", so
        a pattern of `-(\\d+)$` yields "01".
        """
        s = "" if value is None else str(value).strip()
        if s and self.WAFER_ID_PATTERN:
            try:
                m = re.search(self.WAFER_ID_PATTERN, s)
            except re.error:
                m = None
            if m:
                s = (m.group(1) if m.groups() else m.group(0)).strip()
        # Trim separator punctuation left over from the source. 禾纳's
        # tab-delimited dump yields ",001" for its `wafer number` label, and a
        # wafer called ",001" then differs from the same wafer read elsewhere.
        return re.sub(r"^[\s,;:|]+|[\s,;:|]+$", "", s)

    def _file_wafer_id(self, grid: Grid, filepath: str) -> str:
        """Wafer id for the whole file, for every source except `column`."""
        src = self.WAFER_ID_SOURCE
        raw = None
        if src == "cell" and self.WAFER_ID_CELL:
            raw = grid.cell(*self.WAFER_ID_CELL)
        elif src == "label" and self.WAFER_ID_LABEL:
            raw = grid.label_value(self.WAFER_ID_LABEL)
        elif src == "filename":
            raw = os.path.splitext(os.path.basename(filepath))[0]
        elif src == "single":
            # No id anywhere in the file; the file itself is the wafer.
            raw = os.path.splitext(os.path.basename(filepath))[0]
        return self._apply_pattern(raw)

    def _meta_value(self, grid: Grid, cell_ref, label, col,
                    pattern: str | None = None,
                    filename_pattern: str | None = None,
                    filepath: str | None = None) -> str | None:
        """Resolve one metadata field, most specific source first:
        fixed cell -> label anchor -> data column -> the FILE NAME.

        `pattern` trims the raw text — 世界先进's LOT ID cell reads
        "H2XR46.1-01", and keeping the wafer suffix would split one lot into
        five single-wafer lots.

        The file name is a genuine last resort, reached only when the contents
        gave nothing. That ordering is what keeps a naming convention off the
        vendors whose files already state their model.
        """
        # An explicitly configured file-name pattern is a deliberate choice, so
        # it is tried first: 天狼芯 / 禾纳 / 新洁能 do carry *something* in the
        # sheet — a tester program name — but never the model, which lives only
        # in the file name. Content still runs as the fallback, so a file that
        # arrives without the expected name degrades to the program name rather
        # than to nothing. Templates with no file-name pattern (most of them)
        # never look at the name at all.
        if filename_pattern and filepath:
            stem = os.path.splitext(os.path.basename(filepath))[0]
            from_name = self._refine(stem, filename_pattern, strict=True)
            if from_name:
                return from_name

        raw = None
        if cell_ref:
            raw = grid.cell(*cell_ref)
        if raw is None and label:
            raw = grid.label_value(label)
        if raw is None and col:
            raw = grid.cell(self.DATA_START_ROW, col)
        return (self._refine(raw, pattern) if raw is not None else "") or None

    def _row_is_blank(self, grid: Grid, row: int, param_cols: list[int]) -> bool:
        """A row counts as blank when it carries no id and no measurement."""
        for c in (self.WAFER_ID_COL, self.BIN_COL, self.X_COORD_COL, self.Y_COORD_COL):
            if c and grid.cell(row, c) is not None:
                return False
        for c in param_cols:
            if grid.cell(row, c) is not None:
                return False
        return True

    # --- API -----------------------------------------------------------
    def preview(self, filepath: str) -> dict:
        grid = self._open(filepath)
        param_cols = self._param_columns(grid)
        param_names = self._param_names(grid, param_cols)

        wafer_ids: set[str] = set()
        row_count = 0
        blank_run = 0
        file_wafer = (self._file_wafer_id(grid, filepath)
                      if self.WAFER_ID_SOURCE != "column" else None)

        for r in range(self.DATA_START_ROW, grid.n_rows + 1):
            if self._row_is_blank(grid, r, param_cols):
                blank_run += 1
                if blank_run >= _BLANK_RUN_LIMIT:
                    break
                continue
            blank_run = 0
            row_count += 1
            if self.WAFER_ID_SOURCE == "column" and self.WAFER_ID_COL:
                v = grid.cell(r, self.WAFER_ID_COL)
                if v is not None:
                    wafer_ids.add(self._apply_pattern(v) or str(v).strip())
            elif file_wafer:
                wafer_ids.add(file_wafer)

        product_id = self._meta_value(
            grid, self.PRODUCT_ID_CELL, self.PRODUCT_ID_LABEL,
            self.PRODUCT_ID_COL, self.PRODUCT_ID_PATTERN,
            self.PRODUCT_ID_FILENAME_PATTERN, filepath)
        lot_id = self._meta_value(
            grid, self.LOT_ID_CELL, self.LOT_ID_LABEL, self.LOT_ID_COL,
            self.LOT_ID_PATTERN, self.LOT_ID_FILENAME_PATTERN, filepath)

        return {
            "wafersDetected": len(wafer_ids),
            "diePerWafer": self.FIXED_DIE_COUNT,
            "dataRows": row_count,
            "format": self.vendor_code,
            "productId": product_id or None,
            "lotId": lot_id or None,
            "paramNames": param_names,
            "waferIdSource": self.WAFER_ID_SOURCE,
            "waferIds": sorted(wafer_ids)[:50],
            "sheetUsed": grid.sheet_used,
            "sheets": grid.sheets,
            "encoding": grid.encoding,
            "delimiter": grid.delimiter,
        }

    def parse(self, filepath: str) -> ParseResult:
        grid = self._open(filepath)
        param_cols = self._param_columns(grid)
        param_names = self._param_names(grid, param_cols)

        # CP spec limits, read through the unit-aware parser.
        cp_specs = []
        for pname, col in zip(param_names, param_cols):
            unit = grid.cell(self.UNIT_ROW, col) if self.UNIT_ROW else None
            # A format with no limit rows simply yields no limits.
            lower = (to_float(grid.cell(self.LOWER_LIMIT_ROW, col))
                     if self.LOWER_LIMIT_ROW else None)
            upper = (to_float(grid.cell(self.UPPER_LIMIT_ROW, col))
                     if self.UPPER_LIMIT_ROW else None)
            cp_specs.append(ParsedCpSpec(
                param_name=pname,
                lower_limit=lower,
                upper_limit=upper,
                unit=str(unit).strip() if unit is not None else None,
            ))

        product_id = self._meta_value(
            grid, self.PRODUCT_ID_CELL, self.PRODUCT_ID_LABEL,
            self.PRODUCT_ID_COL, self.PRODUCT_ID_PATTERN,
            self.PRODUCT_ID_FILENAME_PATTERN, filepath)
        lot_id = self._meta_value(
            grid, self.LOT_ID_CELL, self.LOT_ID_LABEL, self.LOT_ID_COL,
            self.LOT_ID_PATTERN, self.LOT_ID_FILENAME_PATTERN, filepath)

        file_wafer = (self._file_wafer_id(grid, filepath)
                      if self.WAFER_ID_SOURCE != "column" else None)

        wafers_dict: dict[str, list[ParsedDie]] = {}
        mark_lot_id = None
        test_program = None
        total_rows = 0
        blank_run = 0

        for r in range(self.DATA_START_ROW, grid.n_rows + 1):
            if self._row_is_blank(grid, r, param_cols):
                blank_run += 1
                if blank_run >= _BLANK_RUN_LIMIT:
                    break
                continue
            blank_run = 0

            if self.WAFER_ID_SOURCE == "column":
                raw = grid.cell(r, self.WAFER_ID_COL) if self.WAFER_ID_COL else None
                if raw is None:
                    # No id on a row that does carry data: keep scanning rather
                    # than truncating the file, but do not invent a wafer.
                    continue
                wid = self._apply_pattern(raw) or str(raw).strip()
            else:
                wid = file_wafer
            if not wid:
                continue

            total_rows += 1
            if mark_lot_id is None:
                mv = grid.cell(r, 3)
                tv = grid.cell(r, 5)
                mark_lot_id = str(mv).strip() if mv is not None else None
                test_program = str(tv).strip() if tv is not None else None

            bin_val = grid.cell(r, self.BIN_COL) if self.BIN_COL else None
            x_val = grid.cell(r, self.X_COORD_COL) if self.X_COORD_COL else None
            y_val = grid.cell(r, self.Y_COORD_COL) if self.Y_COORD_COL else None

            electrical = {pname: to_float(grid.cell(r, col))
                          for pname, col in zip(param_names, param_cols)}

            wafers_dict.setdefault(wid, []).append(ParsedDie(
                site_no=None,
                bin=int(to_float(bin_val)) if to_float(bin_val) is not None else 0,
                x_coord=int(to_float(x_val)) if to_float(x_val) is not None else None,
                y_coord=int(to_float(y_val)) if to_float(y_val) is not None else None,
                electrical=electrical,
            ))

        wafers = [
            ParsedWafer(wafer_id=wid, gross_die=len(dies),
                        bin1_count=sum(1 for d in dies if d.bin == 1), dies=dies)
            for wid, dies in wafers_dict.items()
        ]

        return ParseResult(
            product_id=product_id or "",
            lot_id=lot_id or "",
            mark_lot_id=mark_lot_id,
            test_program=test_program,
            vendor_code=self.vendor_code,
            wafers=wafers,
            cp_specs=cp_specs,
            param_names=param_names,
            total_rows=total_rows,
        )

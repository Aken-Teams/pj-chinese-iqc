"""Schemas for the template wizard: detect a layout, try it, save it.

The wizard replaces hand-typing fourteen row/column numbers. Every detected
field travels with its confidence and a sentence of evidence so the UI can show
why a value was chosen and flag the ones a human should check.
"""
from typing import Any

from pydantic import BaseModel

from app.schemas.vendor import WaferIdSource, _LayoutExtras


class CandidateOut(BaseModel):
    value: Any
    confidence: float
    evidence: str
    source: str = "rule"      # rule | ai | user


class GridPreview(BaseModel):
    """Top-left block of the sheet, for the spreadsheet-style picker."""
    rows: list[list[str | None]]
    nRows: int
    nCols: int
    sheets: list[str]
    sheetUsed: str
    encoding: str | None = None
    delimiter: str | None = None


class DetectResponse(BaseModel):
    fileToken: str            # pass back to dry-run; a bare name under uploads/
    fileName: str
    preview: GridPreview
    fields: dict[str, CandidateOut | None]
    warnings: list[str] = []
    # Required fields nothing could resolve. The UI shows these in red; they are
    # often the file's fault (世界先进 ships no wafer id at all), not ours.
    missing: list[str] = []
    conflicts: list[dict] = []
    # A ready-to-save VendorFormat payload built from the detected values.
    template: dict = {}


class TemplateDraft(_LayoutExtras):
    """A candidate template, as edited in the wizard. Everything is optional so
    a half-finished draft can still be dry-run."""
    # Unlike a saved format, a draft may legitimately have no wafer-id source
    # yet: detection leaves it unset when the file carries no wafer id, and the
    # user has to choose. Saving still requires one (VendorFormatCreate).
    wafer_id_source: WaferIdSource | None = None
    format_name: str | None = None
    header_row: int | None = None
    data_start_row: int | None = None
    lower_limit_row: int | None = None
    upper_limit_row: int | None = None
    electrical_start_col: int | None = None
    wafer_id_col: int | None = None
    bin_col: int | None = None
    x_coord_col: int | None = None
    y_coord_col: int | None = None
    product_id_col: int | None = None
    lot_id_col: int | None = None
    fixed_die_count: int | None = None
    product_id_cell: str | None = None
    lot_id_cell: str | None = None


class DryRunRequest(BaseModel):
    file_token: str
    template: TemplateDraft
    vendor_code: str = "PREVIEW"


class SpecPreview(BaseModel):
    param: str
    lower: float | None = None
    upper: float | None = None
    unit: str | None = None


class DryRunResponse(BaseModel):
    """What the template actually produces — shown before anything is saved."""
    ok: bool
    error: str | None = None
    waferCount: int = 0
    dataRows: int = 0
    paramNames: list[str] = []
    waferIds: list[str] = []
    productId: str | None = None
    lotId: str | None = None
    specs: list[SpecPreview] = []
    sampleRows: list[dict] = []
    # Things that parsed but look wrong — an empty result, no limits at all,
    # an implausible wafer count. Surfaced so nobody saves a broken template.
    issues: list[str] = []

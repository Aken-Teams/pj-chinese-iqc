from __future__ import annotations

from pydantic import BaseModel


# ---------------------------------------------------------------------------
# CRUD schemas
# ---------------------------------------------------------------------------

class ReviewRuleCreate(BaseModel):
    product_id: int
    param_name: str
    q1_lower: float | None = None
    q1_upper: float | None = None
    q2_lower: float | None = None
    q2_upper: float | None = None
    q3_lower: float | None = None
    q3_upper: float | None = None


class ReviewRuleUpdate(BaseModel):
    param_name: str | None = None
    q1_lower: float | None = None
    q1_upper: float | None = None
    q2_lower: float | None = None
    q2_upper: float | None = None
    q3_lower: float | None = None
    q3_upper: float | None = None


class ReviewRuleResponse(BaseModel):
    id: int
    product_id: int
    param_name: str
    q1_lower: float | None
    q1_upper: float | None
    q2_lower: float | None
    q2_upper: float | None
    q3_lower: float | None
    q3_upper: float | None
    # Enriched fields (populated when listing across products)
    product_code: str | None = None
    vendor_code: str | None = None
    # AD site (廠區) of the owning product; null for legacy/unassigned.
    domain: str | None = None

    class Config:
        from_attributes = True


# ---------------------------------------------------------------------------
# Import schemas
# ---------------------------------------------------------------------------

class RulePreviewRow(BaseModel):
    product_code: str
    product_code_pjxz: str = ""
    product_id: int | None = None
    vendor_code: str
    param_name_excel: str
    param_name_matched: str | None = None
    match_confidence: float = 0.0
    q1_lower: float | None = None
    q1_upper: float | None = None
    q2_lower: float | None = None
    q2_upper: float | None = None
    q3_lower: float | None = None
    q3_upper: float | None = None
    status: str  # "ready" | "update_existing" | "auto_create" | "no_param_match" | "no_vendor"


class RulesImportPreview(BaseModel):
    file_path: str
    sheets_parsed: list[str]
    total_rules: int
    ready_count: int
    warning_count: int
    rules: list[RulePreviewRow]


class RuleImportItem(BaseModel):
    # If product_id is null, the backend will look up or auto-create the
    # product using vendor_code + product_code.
    product_id: int | None = None
    vendor_code: str | None = None
    product_code: str | None = None
    param_name: str
    q1_lower: float | None = None
    q1_upper: float | None = None
    q2_lower: float | None = None
    q2_upper: float | None = None
    q3_lower: float | None = None
    q3_upper: float | None = None


class RulesImportConfirmRequest(BaseModel):
    file_path: str
    rules: list[RuleImportItem]
    # Recorded on the revision so a ruleset can be traced to the sheet it came
    # from. The temp path in file_path is meaningless to a reader.
    file_name: str | None = None
    note: str | None = None


class RulesImportResult(BaseModel):
    success: bool = True
    created: int = 0
    updated: int = 0
    skipped: int = 0
    products_created: int = 0

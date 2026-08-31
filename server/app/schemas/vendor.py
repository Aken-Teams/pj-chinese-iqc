from typing import Literal

from pydantic import BaseModel, field_validator


class VendorCreate(BaseModel):
    code: str
    name: str


class VendorResponse(BaseModel):
    id: int
    name: str
    code: str
    # AD sites (廠區) this vendor is visible to; empty = unassigned (all sites).
    domains: list[str] = []

    class Config:
        from_attributes = True


WaferIdSource = Literal["column", "cell", "label", "filename", "single"]


class _LayoutExtras(BaseModel):
    """Layout descriptors added after the 2026-08 vendor-file survey.

    All optional, so a template written against the original column-only model
    keeps working unchanged. See app/models/vendor.py for what each one means
    and which real vendor format forced it.
    """
    id_header_row: int | None = None
    unit_row: int | None = None
    sheet_selector: str | None = None
    param_cols: list[int] | None = None
    text_delimiter: str | None = None

    wafer_id_source: WaferIdSource = "column"
    wafer_id_cell: str | None = None
    wafer_id_label: str | None = None
    wafer_id_pattern: str | None = None

    product_id_label: str | None = None
    lot_id_label: str | None = None
    product_id_pattern: str | None = None
    lot_id_pattern: str | None = None
    product_id_filename_pattern: str | None = None
    lot_id_filename_pattern: str | None = None

    @field_validator("wafer_id_pattern", "product_id_pattern", "lot_id_pattern",
                     "product_id_filename_pattern", "lot_id_filename_pattern")
    @classmethod
    def _pattern_must_compile(cls, v: str | None) -> str | None:
        """Reject a bad regex here rather than at parse time, where it would
        silently fall back to the raw value for every wafer in the lot."""
        if v:
            import re
            try:
                re.compile(v)
            except re.error as exc:
                raise ValueError(f"invalid regular expression: {exc}") from exc
        return v


class VendorFormatCreate(_LayoutExtras):
    format_name: str
    header_row: int
    data_start_row: int
    lower_limit_row: int
    upper_limit_row: int
    electrical_start_col: int
    bin_col: int
    # Optional since the survey: only two of six real formats carry a per-row
    # wafer id column. Required when wafer_id_source is "column".
    wafer_id_col: int | None = None
    x_coord_col: int | None = None
    y_coord_col: int | None = None
    product_id_col: int | None = None
    lot_id_col: int | None = None
    fixed_die_count: int | None = None
    product_id_cell: str | None = None
    lot_id_cell: str | None = None


class VendorFormatUpdate(_LayoutExtras):
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


class VendorFormatResponse(_LayoutExtras):
    id: int
    format_name: str | None
    header_row: int
    data_start_row: int
    lower_limit_row: int
    upper_limit_row: int
    electrical_start_col: int
    wafer_id_col: int | None
    bin_col: int
    x_coord_col: int | None
    y_coord_col: int | None
    product_id_col: int | None
    lot_id_col: int | None
    fixed_die_count: int | None
    product_id_cell: str | None
    lot_id_cell: str | None
    # AD site (廠區) this template belongs to; null = unassigned (all sites).
    domain: str | None = None

    class Config:
        from_attributes = True


class ProductResponse(BaseModel):
    id: int
    product_code: str
    vendor_id: int
    vendor_code: str
    vendor_name: str
    # AD site (廠區) the product belongs to; null for legacy/unassigned.
    domain: str | None = None

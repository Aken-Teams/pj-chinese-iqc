from pydantic import BaseModel


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


class VendorFormatCreate(BaseModel):
    format_name: str
    header_row: int
    data_start_row: int
    lower_limit_row: int
    upper_limit_row: int
    electrical_start_col: int
    wafer_id_col: int
    bin_col: int
    x_coord_col: int | None = None
    y_coord_col: int | None = None
    product_id_col: int | None = None
    lot_id_col: int | None = None
    fixed_die_count: int | None = None
    product_id_cell: str | None = None
    lot_id_cell: str | None = None


class VendorFormatUpdate(BaseModel):
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


class VendorFormatResponse(BaseModel):
    id: int
    format_name: str | None
    header_row: int
    data_start_row: int
    lower_limit_row: int
    upper_limit_row: int
    electrical_start_col: int
    wafer_id_col: int
    bin_col: int
    x_coord_col: int | None
    y_coord_col: int | None
    product_id_col: int | None
    lot_id_col: int | None
    fixed_die_count: int | None
    product_id_cell: str | None
    lot_id_cell: str | None

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

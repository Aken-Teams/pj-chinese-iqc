from pydantic import BaseModel


class VendorResponse(BaseModel):
    id: int
    name: str
    code: str

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

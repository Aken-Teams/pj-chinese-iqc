from pydantic import BaseModel


class HistoryRow(BaseModel):
    id: int
    productId: int
    date: str
    vendor: str
    product: str
    lotId: str
    wafers: int
    avgYield: str
    status: str
    # True once 執行審核 has been run for this lot (Lot.status == "reviewed").
    # Distinct from `status`, which is the yield-based PASS/WARN/FAIL display.
    reviewed: bool


class HistoryResponse(BaseModel):
    items: list[HistoryRow]
    total: int
    page: int
    pageSize: int
    totalPages: int

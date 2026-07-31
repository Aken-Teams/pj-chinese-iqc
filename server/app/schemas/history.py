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
    # AD site (廠區) the lot belongs to; null for legacy/unassigned lots. Surfaced
    # so admins (who see all sites) can tell which site a lot came from.
    domain: str | None = None


class HistoryResponse(BaseModel):
    items: list[HistoryRow]
    total: int
    page: int
    pageSize: int
    totalPages: int

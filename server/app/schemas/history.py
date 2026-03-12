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


class HistoryResponse(BaseModel):
    items: list[HistoryRow]
    total: int
    page: int
    pageSize: int
    totalPages: int

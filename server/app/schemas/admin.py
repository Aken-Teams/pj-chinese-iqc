from pydantic import BaseModel


class AiUsageTotals(BaseModel):
    calls: int
    promptTokens: int
    completionTokens: int
    totalTokens: int
    estCost: float
    currency: str


class AiUsageBreakdownRow(BaseModel):
    key: str
    calls: int
    promptTokens: int
    completionTokens: int
    totalTokens: int
    estCost: float


class AiUsageDailyRow(BaseModel):
    date: str
    calls: int
    totalTokens: int


class AiUsageSummary(BaseModel):
    totals: AiUsageTotals
    byFeature: list[AiUsageBreakdownRow]
    byModel: list[AiUsageBreakdownRow]
    daily: list[AiUsageDailyRow]
    currency: str


class AiUsageRecord(BaseModel):
    id: int
    feature: str
    model: str
    promptTokens: int
    completionTokens: int
    totalTokens: int
    lang: str | None
    userName: str | None
    lotId: int | None
    waferId: int | None
    # AD site (廠區) of the lot this AI call analyzed; null if not lot-bound.
    domain: str | None = None
    timestamp: str


class AiUsageRecentResponse(BaseModel):
    items: list[AiUsageRecord]
    total: int
    page: int
    pageSize: int
    totalPages: int

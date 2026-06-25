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
    timestamp: str

from pydantic import BaseModel


class AnomalyDetectRequest(BaseModel):
    lot_id: int
    params: list[str] | None = None
    lang: str = "zh-TW"


class AnomalyItem(BaseModel):
    id: int
    severity: str
    title: str
    description: str
    confidence: float
    timestamp: str
    paramName: str | None = None
    isResolved: bool = False


class ReviewSummaryRequest(BaseModel):
    lot_id: int
    wafer_id: int | None = None
    lang: str = "zh-TW"


class ReviewSummaryResponse(BaseModel):
    summary: str
    riskLevel: str | None = None
    keyFindings: list[str] | None = None

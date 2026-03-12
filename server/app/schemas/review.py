from pydantic import BaseModel


class ReviewExecuteRequest(BaseModel):
    lot_id: int
    params: list[str] | None = None


class WaferReviewRow(BaseModel):
    waferId: str
    dieCount: int
    bin1Yield: float
    q1Yield: float
    q2Yield: float
    q3Yield: float
    status: str


class LotReviewSummary(BaseModel):
    lotId: str
    vendor: str
    product: str
    waferCount: int
    avgYield: float
    totalDies: int
    q1Compliance: str
    q2Compliance: str
    wafers: list[WaferReviewRow]


class ElectricalParam(BaseModel):
    param: str
    avg: str
    stdev: str
    min: str
    max: str
    maxWarning: bool = False


class WaferDetail(BaseModel):
    waferId: str
    lotId: str
    totalDies: int
    bin1Pass: int
    bin1Yield: float
    failCount: int
    electricalParams: list[ElectricalParam]

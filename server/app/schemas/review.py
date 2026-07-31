from pydantic import BaseModel


class ReviewExecuteRequest(BaseModel):
    lot_id: int
    params: list[str] | None = None


class WaferReviewRow(BaseModel):
    dbId: int
    waferId: str
    dieCount: int
    bin1Yield: float
    # Per-wafer Q yields = the WORST (min) electrical item at each Q level, not a
    # cross-parameter average. The average mixed differing rule sets and could
    # show a stricter Q2 higher than Q1 (徐州 bug); the worst-item value is the
    # true bottleneck and stays monotonic (Q2 spec ⊂ Q1 ⇒ Q2 ≤ Q1 per item).
    q1Yield: float | None = None
    q2Yield: float | None = None
    q3Yield: float | None = None
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
    # Per-electrical-item yields (%). None when no rule is defined for that Q
    # level. Shown per-item so a drifting parameter can be pinpointed instead of
    # hidden inside a cross-parameter combined yield.
    q1Yield: float | None = None
    q2Yield: float | None = None
    q3Yield: float | None = None


class WaferDetail(BaseModel):
    waferId: str
    lotId: str
    totalDies: int
    bin1Pass: int
    bin1Yield: float
    failCount: int
    electricalParams: list[ElectricalParam]

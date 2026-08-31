from pydantic import BaseModel


class ReviewExecuteRequest(BaseModel):
    lot_id: int
    params: list[str] | None = None


class BatchReviewRequest(BaseModel):
    lot_ids: list[int]


class BatchReviewItem(BaseModel):
    lotId: int
    success: bool
    resultCount: int = 0
    error: str | None = None


class BatchReviewResponse(BaseModel):
    reviewed: int
    failed: int
    results: list[BatchReviewItem]


class WaferReviewRow(BaseModel):
    dbId: int
    waferId: str
    dieCount: int
    bin1Yield: float
    # Per-wafer Q yields = the true combined (die-intersection) yield: fraction
    # of dies passing EVERY parameter's limit at that Q level. Not a
    # cross-parameter average (which produced the impossible "Q2 > Q1"). Null
    # until the lot has been (re-)reviewed.
    q1Yield: float | None = None
    q2Yield: float | None = None
    q3Yield: float | None = None
    status: str


class LotReviewSummary(BaseModel):
    lotId: str
    vendor: str
    product: str
    # AD site (廠區) the lot belongs to; null for legacy/unassigned lots.
    domain: str | None = None
    waferCount: int
    avgYield: float
    totalDies: int
    q1Compliance: str
    q2Compliance: str
    wafers: list[WaferReviewRow]

    # What the system worked out from the site's thresholds, and the yield it
    # judged on. Advisory — a person has the last word.
    judgement: str | None = None
    judgedYield: float | None = None
    # True once 執行審核 has run. Until then the judgement above is computed on
    # the fly and the Q columns have nothing to show.
    reviewed: bool = False
    passMin: float | None = None
    warnMin: float | None = None
    basis: str | None = None
    # The decision a person recorded, kept apart so a re-review never
    # overwrites it.
    confirmedJudgement: str | None = None
    confirmedBy: str | None = None
    confirmedAt: str | None = None
    confirmNote: str | None = None


class ConfirmJudgementRequest(BaseModel):
    lot_id: int
    # PASS / WARN / HOLD, or null to withdraw a confirmation.
    judgement: str | None = None
    note: str | None = None


class ThresholdResponse(BaseModel):
    domain: str | None = None
    passMin: float
    warnMin: float
    basis: str


class ThresholdUpdate(BaseModel):
    domain: str | None = None
    passMin: float
    warnMin: float
    basis: str = "q1"


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


class MatrixCell(BaseModel):
    # One electrical item's yields for one wafer. None = no rule for that Q level.
    q1: float | None = None
    q2: float | None = None
    q3: float | None = None


class MatrixWaferRow(BaseModel):
    waferId: str
    bin1Yield: float
    cells: list[MatrixCell]  # aligned index-for-index with ReviewMatrix.params


class ReviewMatrix(BaseModel):
    # Per-electrical-item yield matrix (每片 × 每參數 × Q1/Q2/Q3), no combined
    # yield — the layout the 徐州 spec asks for, so a drifting item is pinpointed.
    params: list[str]
    wafers: list[MatrixWaferRow]

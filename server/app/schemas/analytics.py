from pydantic import BaseModel


class SpcDataPoint(BaseModel):
    waferId: str
    value: float
    isOoc: bool = False


class SpcResponse(BaseModel):
    param: str
    dataPoints: list[SpcDataPoint]
    grandMean: float
    ucl: float
    lcl: float
    sigma2Upper: float
    sigma2Lower: float


class DistributionResponse(BaseModel):
    param: str
    mean: float
    stdev: float
    cpk: float | None
    bins: list[float]
    counts: list[int]


class CorrelationPair(BaseModel):
    paramA: str
    paramB: str
    correlation: float


class CorrelationResponse(BaseModel):
    params: list[str]
    matrix: list[list[float]]

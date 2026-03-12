from pydantic import BaseModel


class DieCell(BaseModel):
    x: int
    y: int
    bin: int


class WaferMapResponse(BaseModel):
    waferId: str
    dies: list[DieCell]
    maxX: int
    maxY: int
    minX: int
    minY: int


class BinCount(BaseModel):
    bin: int
    label: str
    count: int


class WaferStatsResponse(BaseModel):
    totalDies: int
    bin1Pass: int
    bin1Yield: float
    failCount: int


class BinDistributionResponse(BaseModel):
    bins: list[BinCount]

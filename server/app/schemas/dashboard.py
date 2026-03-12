from pydantic import BaseModel


class KpiItem(BaseModel):
    labelKey: str
    value: str
    delta: str
    deltaType: str


class VendorTrend(BaseModel):
    name: str
    color: str
    data: list[float]


class YieldTrend(BaseModel):
    months: list[str]
    vendors: list[VendorTrend]


class VendorPerf(BaseModel):
    name: str
    yield_val: float


class AiInsight(BaseModel):
    severity: str
    title: str
    description: str


class ActivityItem(BaseModel):
    time: str
    action: str
    user: str


class CpkItem(BaseModel):
    param: str
    value: float


class DashboardResponse(BaseModel):
    kpis: list[KpiItem]
    yieldTrend: YieldTrend
    vendorPerf: list[VendorPerf]
    aiInsights: list[AiInsight]
    recentActivity: list[ActivityItem]
    cpkData: list[CpkItem]

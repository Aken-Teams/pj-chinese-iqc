from pydantic import BaseModel


class SpecCompareRequest(BaseModel):
    lot_id: int
    rule: str = "standard"


class CompareRow(BaseModel):
    param: str
    cpLower: str
    cpUpper: str
    ftLower: str
    ftUpper: str
    margin: str
    result: str


class SpecCompareResponse(BaseModel):
    matchCount: int
    tighterCount: int
    outOfRangeCount: int
    rows: list[CompareRow]


class PackagingSpecCreate(BaseModel):
    product_id: int
    param_name: str
    lower_limit: float | None = None
    upper_limit: float | None = None
    unit: str | None = None
    test_condition: str | None = None


class PackagingSpecUpdate(BaseModel):
    param_name: str | None = None
    lower_limit: float | None = None
    upper_limit: float | None = None
    unit: str | None = None
    test_condition: str | None = None


class PackagingSpecResponse(BaseModel):
    id: int
    product_id: int
    param_name: str
    lower_limit: float | None
    upper_limit: float | None
    unit: str | None
    test_condition: str | None

    class Config:
        from_attributes = True

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

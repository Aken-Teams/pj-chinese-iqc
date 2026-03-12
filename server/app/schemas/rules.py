from pydantic import BaseModel


class ReviewRuleCreate(BaseModel):
    product_id: int
    param_name: str
    q1_lower: float | None = None
    q1_upper: float | None = None
    q2_lower: float | None = None
    q2_upper: float | None = None
    q3_lower: float | None = None
    q3_upper: float | None = None


class ReviewRuleUpdate(BaseModel):
    param_name: str | None = None
    q1_lower: float | None = None
    q1_upper: float | None = None
    q2_lower: float | None = None
    q2_upper: float | None = None
    q3_lower: float | None = None
    q3_upper: float | None = None


class ReviewRuleResponse(BaseModel):
    id: int
    product_id: int
    param_name: str
    q1_lower: float | None
    q1_upper: float | None
    q2_lower: float | None
    q2_upper: float | None
    q3_lower: float | None
    q3_upper: float | None

    class Config:
        from_attributes = True

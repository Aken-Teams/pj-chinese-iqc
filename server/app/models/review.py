from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import relationship

from app.database import Base


class ReviewRule(Base):
    __tablename__ = "review_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    q1_lower = Column(Numeric(15, 6))
    q1_upper = Column(Numeric(15, 6))
    q2_lower = Column(Numeric(15, 6))
    q2_upper = Column(Numeric(15, 6))
    q3_lower = Column(Numeric(15, 6))
    q3_upper = Column(Numeric(15, 6))
    created_by = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())

    product = relationship("Product", back_populates="review_rules")


class ReviewResult(Base):
    __tablename__ = "review_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wafer_id = Column(Integer, ForeignKey("wafers.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    average = Column(Numeric(15, 6))
    stdev = Column(Numeric(15, 6))
    max_val = Column(Numeric(15, 6))
    min_val = Column(Numeric(15, 6))
    bin1_yield = Column(Numeric(6, 4))
    q1_yield = Column(Numeric(6, 4))
    q2_yield = Column(Numeric(6, 4))
    q3_yield = Column(Numeric(6, 4))
    reviewed_at = Column(DateTime, server_default=func.now())

    wafer = relationship("Wafer", back_populates="review_results")

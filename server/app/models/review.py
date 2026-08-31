from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, func
from sqlalchemy.orm import relationship

from sqlalchemy.dialects.mysql import DOUBLE

from app.database import Base

# DOUBLE, not NUMERIC: CP data spans volts down to picoamps, and a
# fixed-point scale wide enough for both is impractical. NUMERIC(15,6)
# rounded every nanoamp reading and limit to exactly zero. See
# migration 016.



class ReviewRule(Base):
    __tablename__ = "review_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    q1_lower = Column(DOUBLE)
    q1_upper = Column(DOUBLE)
    q2_lower = Column(DOUBLE)
    q2_upper = Column(DOUBLE)
    q3_lower = Column(DOUBLE)
    q3_upper = Column(DOUBLE)
    created_by = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())

    product = relationship("Product", back_populates="review_rules")


class ReviewResult(Base):
    __tablename__ = "review_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wafer_id = Column(Integer, ForeignKey("wafers.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    average = Column(DOUBLE)
    stdev = Column(DOUBLE)
    max_val = Column(DOUBLE)
    min_val = Column(DOUBLE)
    bin1_yield = Column(Numeric(6, 4))
    q1_yield = Column(Numeric(6, 4))
    q2_yield = Column(Numeric(6, 4))
    q3_yield = Column(Numeric(6, 4))
    reviewed_at = Column(DateTime, server_default=func.now())

    wafer = relationship("Wafer", back_populates="review_results")

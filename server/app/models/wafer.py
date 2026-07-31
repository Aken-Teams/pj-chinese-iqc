from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class Wafer(Base):
    __tablename__ = "wafers"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=False)
    wafer_id = Column(String(20), nullable=False)
    gross_die = Column(Integer)
    bin1_count = Column(Integer)
    bin1_yield = Column(Numeric(6, 4))
    cp_step = Column(String(20))
    start_time = Column(DateTime)
    # True combined (die-intersection) yields: fraction of Bin1 dies whose values
    # pass EVERY parameter's limit at that Q level. Populated by execute_review;
    # null until the lot is (re-)reviewed. This is the real wafer Q-level yield —
    # not a cross-parameter average — so a single failing parameter is reflected
    # honestly instead of averaged away or read from one worst column.
    q1_combined = Column(Numeric(6, 4))
    q2_combined = Column(Numeric(6, 4))
    q3_combined = Column(Numeric(6, 4))

    __table_args__ = (
        UniqueConstraint("lot_id", "wafer_id", name="uq_lot_wafer"),
    )

    lot = relationship("Lot", back_populates="wafers")
    dies = relationship("DieData", back_populates="wafer", cascade="all, delete-orphan")
    review_results = relationship("ReviewResult", back_populates="wafer", cascade="all, delete-orphan")

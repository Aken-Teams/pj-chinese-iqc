from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, UniqueConstraint, func

from app.database import Base


class VendorScore(Base):
    __tablename__ = "vendor_scores"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    period = Column(String(7), nullable=False)
    avg_yield = Column(Numeric(6, 4))
    lot_count = Column(Integer)
    anomaly_count = Column(Integer)
    cpk_avg = Column(Numeric(6, 3))
    score = Column(Numeric(5, 2))
    rank = Column(Integer)
    calculated_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("vendor_id", "period", name="uq_vendor_period"),
    )

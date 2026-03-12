from sqlalchemy import (
    Column, Integer, String, DateTime, ForeignKey, Numeric, Boolean,
    UniqueConstraint, func,
)

from app.database import Base


class SpcDataPoint(Base):
    __tablename__ = "spc_data_points"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wafer_id = Column(Integer, ForeignKey("wafers.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    value = Column(Numeric(15, 6))
    range_value = Column(Numeric(15, 6))
    ucl = Column(Numeric(15, 6))
    lcl = Column(Numeric(15, 6))
    mean = Column(Numeric(15, 6))
    sigma_2_upper = Column(Numeric(15, 6))
    sigma_2_lower = Column(Numeric(15, 6))
    is_ooc = Column(Boolean, default=False)
    recorded_at = Column(DateTime, server_default=func.now())


class CpkResult(Base):
    __tablename__ = "cpk_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    cp = Column(Numeric(6, 3))
    cpk = Column(Numeric(6, 3))
    mean = Column(Numeric(15, 6))
    stdev = Column(Numeric(15, 6))
    usl = Column(Numeric(15, 6))
    lsl = Column(Numeric(15, 6))
    calculated_at = Column(DateTime, server_default=func.now())


class ParamCorrelation(Base):
    __tablename__ = "param_correlations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    param_a = Column(String(50), nullable=False)
    param_b = Column(String(50), nullable=False)
    correlation = Column(Numeric(5, 4))
    sample_size = Column(Integer)
    p_value = Column(Numeric(10, 8))
    calculated_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("product_id", "param_a", "param_b", name="uq_product_params"),
    )

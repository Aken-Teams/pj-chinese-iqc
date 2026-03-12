from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Boolean, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class CpSpec(Base):
    __tablename__ = "cp_specs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    lower_limit = Column(Numeric(15, 6))
    upper_limit = Column(Numeric(15, 6))
    unit = Column(String(20))
    bias_info = Column(Text)

    lot = relationship("Lot", back_populates="cp_specs")


class PackagingSpec(Base):
    __tablename__ = "packaging_specs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    lower_limit = Column(Numeric(15, 6))
    upper_limit = Column(Numeric(15, 6))
    unit = Column(String(20))
    test_condition = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    product = relationship("Product", back_populates="packaging_specs")


class SpecComparison(Base):
    __tablename__ = "spec_comparisons"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=False)
    cp_param_name = Column(String(50))
    pkg_param_name = Column(String(50))
    cp_lower = Column(Numeric(15, 6))
    cp_upper = Column(Numeric(15, 6))
    pkg_lower = Column(Numeric(15, 6))
    pkg_upper = Column(Numeric(15, 6))
    internal_lower = Column(Numeric(15, 6))
    internal_upper = Column(Numeric(15, 6))
    is_compliant = Column(Boolean)
    compliance_note = Column(Text)
    compared_at = Column(DateTime, server_default=func.now())

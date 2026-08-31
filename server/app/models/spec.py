from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Boolean, Text, func
from sqlalchemy.orm import relationship

from sqlalchemy.dialects.mysql import DOUBLE

from app.database import Base

# DOUBLE, not NUMERIC: CP data spans volts down to picoamps, and a
# fixed-point scale wide enough for both is impractical. NUMERIC(15,6)
# rounded every nanoamp reading and limit to exactly zero. See
# migration 016.



class CpSpec(Base):
    __tablename__ = "cp_specs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    lower_limit = Column(DOUBLE)
    upper_limit = Column(DOUBLE)
    unit = Column(String(20))
    bias_info = Column(Text)

    lot = relationship("Lot", back_populates="cp_specs")


class PackagingSpec(Base):
    __tablename__ = "packaging_specs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    lower_limit = Column(DOUBLE)
    upper_limit = Column(DOUBLE)
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
    cp_lower = Column(DOUBLE)
    cp_upper = Column(DOUBLE)
    pkg_lower = Column(DOUBLE)
    pkg_upper = Column(DOUBLE)
    internal_lower = Column(DOUBLE)
    internal_upper = Column(DOUBLE)
    is_compliant = Column(Boolean)
    compliance_note = Column(Text)
    compared_at = Column(DateTime, server_default=func.now())

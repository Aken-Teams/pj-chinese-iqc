from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class Vendor(Base):
    __tablename__ = "vendors"

    id = Column(Integer, primary_key=True, autoincrement=True)
    name = Column(String(100), nullable=False)
    code = Column(String(20), unique=True, nullable=False)
    created_at = Column(DateTime, server_default=func.now())

    formats = relationship("VendorFormat", back_populates="vendor")
    products = relationship("Product", back_populates="vendor")
    site_links = relationship("VendorDomain", cascade="all, delete-orphan", back_populates="vendor")


class VendorDomain(Base):
    """Which AD sites (廠區) a vendor is visible to. A vendor is a shared
    supplier (unique code) that can serve multiple sites — e.g. JJW serves both
    徐州 and 無錫 — so this is a many-to-many. A vendor with NO rows is
    unassigned and visible to everyone (backward-compatible default)."""
    __tablename__ = "vendor_domains"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    domain = Column(String(20), nullable=False, index=True)

    vendor = relationship("Vendor", back_populates="site_links")

    __table_args__ = (
        UniqueConstraint("vendor_id", "domain", name="uq_vendor_domain"),
    )


class VendorFormat(Base):
    __tablename__ = "vendor_formats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    vendor_id = Column(Integer, ForeignKey("vendors.id"), nullable=False)
    format_name = Column(String(100))
    header_row = Column(Integer, nullable=False)
    data_start_row = Column(Integer, nullable=False)
    lower_limit_row = Column(Integer, nullable=False)
    upper_limit_row = Column(Integer, nullable=False)
    electrical_start_col = Column(Integer, nullable=False)
    wafer_id_col = Column(Integer, nullable=False)
    bin_col = Column(Integer, nullable=False)
    x_coord_col = Column(Integer)
    y_coord_col = Column(Integer)
    product_id_col = Column(Integer)
    lot_id_col = Column(Integer)
    fixed_die_count = Column(Integer, nullable=True)
    # Read product/lot from a fixed metadata cell instead of data rows.
    # Format: "row,col" (1-indexed), e.g. "2,2" = row 2 col B.
    product_id_cell = Column(String(20), nullable=True)
    lot_id_cell = Column(String(20), nullable=True)
    created_at = Column(DateTime, server_default=func.now())
    updated_at = Column(DateTime, server_default=func.now(), onupdate=func.now())

    vendor = relationship("Vendor", back_populates="formats")

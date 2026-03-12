from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_code = Column(String(50), unique=True, nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"))
    description = Column(Text)
    created_at = Column(DateTime, server_default=func.now())

    vendor = relationship("Vendor", back_populates="products")
    lots = relationship("Lot", back_populates="product")
    review_rules = relationship("ReviewRule", back_populates="product")
    packaging_specs = relationship("PackagingSpec", back_populates="product")

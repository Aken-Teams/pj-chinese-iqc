from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Text, UniqueConstraint, func
from sqlalchemy.orm import relationship

from app.database import Base


class Product(Base):
    __tablename__ = "products"

    id = Column(Integer, primary_key=True, autoincrement=True)
    # product_code is unique PER SITE (廠區), not globally: each site keeps its
    # own product + specs/rules copy, so 無錫 and 徐州 can both have "A033A"
    # independently. Null domain = legacy (pre-separation), treated as 徐州.
    product_code = Column(String(50), nullable=False)
    vendor_id = Column(Integer, ForeignKey("vendors.id"))
    description = Column(Text)
    domain = Column(String(20), index=True)
    created_at = Column(DateTime, server_default=func.now())

    __table_args__ = (
        UniqueConstraint("product_code", "domain", name="uq_product_code_domain"),
    )

    vendor = relationship("Vendor", back_populates="products")
    lots = relationship("Lot", back_populates="product")
    review_rules = relationship("ReviewRule", back_populates="product")
    packaging_specs = relationship("PackagingSpec", back_populates="product")

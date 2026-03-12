from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import relationship

from app.database import Base


class Lot(Base):
    __tablename__ = "lots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(String(50), nullable=False)
    mark_lot_id = Column(String(50))
    product_id = Column(Integer, ForeignKey("products.id"))
    test_program = Column(String(100))
    upload_time = Column(DateTime, server_default=func.now())
    file_name = Column(String(255))
    status = Column(String(20), default="pending")

    product = relationship("Product", back_populates="lots")
    wafers = relationship("Wafer", back_populates="lot", cascade="all, delete-orphan")
    cp_specs = relationship("CpSpec", back_populates="lot", cascade="all, delete-orphan")

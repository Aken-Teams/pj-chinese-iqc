from sqlalchemy import Column, Integer, BigInteger, String, ForeignKey, Numeric, Index
from sqlalchemy.orm import relationship

from app.database import Base


class DieData(Base):
    __tablename__ = "die_data"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    wafer_id = Column(Integer, ForeignKey("wafers.id"), nullable=False, index=True)
    site_no = Column(Integer)
    bin = Column(Integer, nullable=False)
    x_coord = Column(Integer)
    y_coord = Column(Integer)

    wafer = relationship("Wafer", back_populates="dies")
    electrical_values = relationship(
        "ElectricalValue", back_populates="die", cascade="all, delete-orphan"
    )


class ElectricalValue(Base):
    __tablename__ = "electrical_values"

    id = Column(BigInteger, primary_key=True, autoincrement=True)
    die_id = Column(BigInteger, ForeignKey("die_data.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    value = Column(Numeric(15, 6))

    die = relationship("DieData", back_populates="electrical_values")

    __table_args__ = (
        Index("idx_die_param", "die_id", "param_name"),
    )

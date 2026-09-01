from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, func, Text
from sqlalchemy.orm import relationship

from sqlalchemy.dialects.mysql import DOUBLE

from app.database import Base


class Lot(Base):
    __tablename__ = "lots"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(String(50), nullable=False)
    mark_lot_id = Column(String(50))
    product_id = Column(Integer, ForeignKey("products.id"))
    test_program = Column(String(100))
    upload_time = Column(DateTime, server_default=func.now())
    # When the wafers were tested, read from the CP file. Distinct from
    # upload_time: 無錫's whole history arrived in one import, so upload_time
    # cannot carry a trend. NULL where the file says nothing.
    test_date = Column(DateTime, index=True)
    file_name = Column(String(255))
    status = Column(String(20), default="pending")
    # AD site (廠區) this lot belongs to = the uploader's domain at upload time.
    # Null for legacy lots (before site separation) and local/admin uploads;
    # those stay visible only to admins. Site users see only their own domain.
    domain = Column(String(20), index=True)

    # What the review worked out, from the site's yield thresholds.
    judgement = Column(String(10))            # PASS | WARN | HOLD
    judged_yield = Column(DOUBLE)             # the yield the judgement was made on
    # What a person decided. Kept separate from `judgement` so re-running the
    # review never silently overwrites someone's decision.
    confirmed_judgement = Column(String(10))
    confirmed_by = Column(Integer)
    confirmed_at = Column(DateTime)
    confirm_note = Column(Text)

    product = relationship("Product", back_populates="lots")
    wafers = relationship("Wafer", back_populates="lot", cascade="all, delete-orphan")
    cp_specs = relationship("CpSpec", back_populates="lot", cascade="all, delete-orphan")

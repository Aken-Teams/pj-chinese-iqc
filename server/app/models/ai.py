from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, Boolean, Text, JSON, func

from app.database import Base


class AiAnomaly(Base):
    __tablename__ = "ai_anomalies"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=False)
    wafer_id = Column(Integer, ForeignKey("wafers.id"), nullable=True)
    anomaly_type = Column(String(50), nullable=False)
    severity = Column(String(20), nullable=False)
    confidence = Column(Numeric(5, 2))
    param_name = Column(String(50))
    description = Column(Text)
    suggestion = Column(Text)
    lang = Column(String(10), nullable=False, server_default="zh-TW")
    is_resolved = Column(Boolean, default=False)
    detected_at = Column(DateTime, server_default=func.now())


class AiReviewSummary(Base):
    __tablename__ = "ai_review_summaries"

    id = Column(Integer, primary_key=True, autoincrement=True)
    lot_id = Column(Integer, ForeignKey("lots.id"), nullable=False)
    wafer_id = Column(Integer, ForeignKey("wafers.id"), nullable=True)
    summary = Column(Text, nullable=False)
    key_findings = Column(JSON, nullable=True)
    risk_level = Column(String(20))
    model_version = Column(String(20))
    lang = Column(String(10), nullable=False, server_default="zh-TW")
    generated_at = Column(DateTime, server_default=func.now())

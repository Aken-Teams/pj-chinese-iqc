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


class AiTokenUsage(Base):
    """One row per AI (LLM) call — the billing/metering ledger.

    Every place the system calls the AI provider records its token usage here so
    the admin console can show how many tokens each feature has consumed.
    """
    __tablename__ = "ai_token_usage"

    id = Column(Integer, primary_key=True, autoincrement=True)
    feature = Column(String(50), nullable=False)  # e.g. review_summary, anomaly_detect
    model = Column(String(50), nullable=False)
    prompt_tokens = Column(Integer, nullable=False, default=0)
    completion_tokens = Column(Integer, nullable=False, default=0)
    total_tokens = Column(Integer, nullable=False, default=0)
    lang = Column(String(10))
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    lot_id = Column(Integer, nullable=True)
    wafer_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, server_default=func.now())


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

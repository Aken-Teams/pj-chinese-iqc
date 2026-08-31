from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Numeric, func, JSON, Text
from sqlalchemy.orm import relationship

from sqlalchemy.dialects.mysql import DOUBLE

from app.database import Base

# DOUBLE, not NUMERIC: CP data spans volts down to picoamps, and a
# fixed-point scale wide enough for both is impractical. NUMERIC(15,6)
# rounded every nanoamp reading and limit to exactly zero. See
# migration 016.



class ReviewRule(Base):
    __tablename__ = "review_rules"

    id = Column(Integer, primary_key=True, autoincrement=True)
    product_id = Column(Integer, ForeignKey("products.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    q1_lower = Column(DOUBLE)
    q1_upper = Column(DOUBLE)
    q2_lower = Column(DOUBLE)
    q2_upper = Column(DOUBLE)
    q3_lower = Column(DOUBLE)
    q3_upper = Column(DOUBLE)
    created_by = Column(Integer)
    created_at = Column(DateTime, server_default=func.now())

    product = relationship("Product", back_populates="review_rules")


class ReviewResult(Base):
    __tablename__ = "review_results"

    id = Column(Integer, primary_key=True, autoincrement=True)
    wafer_id = Column(Integer, ForeignKey("wafers.id"), nullable=False)
    param_name = Column(String(50), nullable=False)
    average = Column(DOUBLE)
    stdev = Column(DOUBLE)
    max_val = Column(DOUBLE)
    min_val = Column(DOUBLE)
    bin1_yield = Column(Numeric(6, 4))
    q1_yield = Column(Numeric(6, 4))
    q2_yield = Column(Numeric(6, 4))
    q3_yield = Column(Numeric(6, 4))
    reviewed_at = Column(DateTime, server_default=func.now())

    wafer = relationship("Wafer", back_populates="review_results")


class ReviewThreshold(Base):
    """PASS / WARN / HOLD cut-offs for one site (廠區).

    Replaces the 95/98 that was hardcoded in two routers and matched neither
    site. A row with `domain = None` is the fallback for any site without one.
    """
    __tablename__ = "review_thresholds"

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(String(20), unique=True)
    pass_min = Column(DOUBLE, nullable=False)      # >= this -> PASS
    warn_min = Column(DOUBLE, nullable=False)      # >= this -> WARN, below -> HOLD
    # Which yield the cut-offs read: "q1" (against the limits) or "bin1".
    # 徐州's Q1 limits are the vendor's own CP limits, so Q1 yield reproduces the
    # bin yield exactly -- one basis serves both sites.
    basis = Column(String(10), nullable=False, default="q1")
    updated_by = Column(Integer)
    updated_at = Column(DateTime, server_default=func.now())


class RuleRevision(Base):
    """One change to a site's review rules.

    `version` is per site and 1-based, so an exported sheet can name the
    ruleset it was taken from and a returned file can be traced back to it.
    """
    __tablename__ = "rule_revisions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    domain = Column(String(20), index=True)
    version = Column(Integer, nullable=False)
    action = Column(String(20), nullable=False)      # import | clear | edit
    file_name = Column(String(255))
    changed_by = Column(Integer)
    changed_at = Column(DateTime, server_default=func.now())
    note = Column(Text)
    rules_before = Column(Integer)
    rules_after = Column(Integer)
    changes = Column(JSON)

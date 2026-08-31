"""Turn a lot's yield into PASS / WARN / HOLD, using the site's own thresholds.

The cut-offs used to be the literals 95 and 98, written out twice — once in
routers/history.py and once in routers/review.py — and they matched neither
site. 無錫's written rule is "低于80% HOLD，低于90% WARN，高于90% PASS"; 徐州 judge
off Q1-Q3. Both are the same measurement underneath: 徐州's Q1 limits are the
vendor's own CP limits, so Q1 yield reproduces the bin yield exactly. One
threshold per site over Q1 therefore serves both, and either can move theirs
without touching the other.

The result is advisory. A person confirms it, and their decision is stored
separately so re-running a review never overwrites it.
"""

from __future__ import annotations

from typing import Optional

from sqlalchemy.orm import Session

from app.models.lot import Lot
from app.models.review import ReviewThreshold
from app.models.wafer import Wafer

PASS = "PASS"
WARN = "WARN"
HOLD = "HOLD"

# Used only if the thresholds table is empty, which migration 017 seeds.
_FALLBACK = (0.90, 0.80, "q1")


def get_thresholds(db: Session, domain: Optional[str]) -> tuple[float, float, str]:
    """(pass_min, warn_min, basis) for a site, falling back to the global row."""
    row = (db.query(ReviewThreshold)
           .filter(ReviewThreshold.domain == domain).first())
    if row is None:
        row = (db.query(ReviewThreshold)
               .filter(ReviewThreshold.domain.is_(None)).first())
    if row is None:
        return _FALLBACK
    return (float(row.pass_min), float(row.warn_min), row.basis or "q1")


def classify(yield_value: Optional[float], pass_min: float, warn_min: float) -> Optional[str]:
    """PASS at or above pass_min, WARN at or above warn_min, HOLD below.

    None in, None out: a lot with nothing to measure is not a passing lot, and
    calling it HOLD would raise an alarm about missing data rather than quality.
    """
    if yield_value is None:
        return None
    if yield_value >= pass_min:
        return PASS
    if yield_value >= warn_min:
        return WARN
    return HOLD


def lot_yield(db: Session, lot: Lot, basis: str) -> Optional[float]:
    """The lot's yield on the given basis, averaged over its wafers.

    Q1 falls back to the bin yield per wafer: a wafer with no Q1 limits still
    has a bin yield, and dropping it would quietly shrink the denominator.
    """
    wafers = db.query(Wafer).filter(Wafer.lot_id == lot.id).all()
    if not wafers:
        return None
    values = []
    for w in wafers:
        v = None
        if basis == "q1" and w.q1_combined is not None:
            v = float(w.q1_combined)
        elif w.bin1_yield is not None:
            v = float(w.bin1_yield)
        if v is not None:
            values.append(v)
    return sum(values) / len(values) if values else None


def judge_lot(db: Session, lot: Lot) -> tuple[Optional[str], Optional[float]]:
    """Work out and store the system's judgement for a lot.

    Only `judgement` / `judged_yield` are touched. `confirmed_judgement` is a
    person's decision and is never written here.
    """
    pass_min, warn_min, basis = get_thresholds(db, lot.domain)
    value = lot_yield(db, lot, basis)
    verdict = classify(value, pass_min, warn_min)
    lot.judgement = verdict
    lot.judged_yield = value
    return verdict, value

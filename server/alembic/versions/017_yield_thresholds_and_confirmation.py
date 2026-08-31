"""Configurable yield thresholds, and a human confirmation step on a lot.

Two things the 2026-08 two-site review asked for.

The PASS/WARN/HOLD cut-offs were hardcoded as 95/98 in two separate places
(routers/history.py and routers/review.py), and matched neither site: 無錫 judge
at 90/80 by their own written rule ("低于80% HOLD，低于90% WARN，高于90% PASS"),
while 徐州 judge off Q1-Q3. Both are the same measurement — 徐州's Q1 limits are
the vendor's own CP limits, so Q1 yield reproduces the bin yield exactly — so one
threshold per site over Q1 serves both.

And the review is advisory, not final: the system flags warnings and anomalies,
a person decides. `lots.status` only knew pending/reviewed, with no record of who
decided what, so the decision had nowhere to live.

Revision ID: 017
Revises: 016
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "017"
down_revision = "016"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "review_thresholds",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        # NULL = the fallback used by any site without its own row.
        sa.Column("domain", sa.String(20), nullable=True),
        sa.Column("pass_min", mysql.DOUBLE(), nullable=False),
        sa.Column("warn_min", mysql.DOUBLE(), nullable=False),
        # Which yield the cut-offs apply to: "q1" (limit-based) or "bin1".
        sa.Column("basis", sa.String(10), nullable=False, server_default="q1"),
        sa.Column("updated_by", sa.Integer, nullable=True),
        sa.Column("updated_at", sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint("domain", name="uq_threshold_domain"),
    )

    # 無錫's written rule, applied to both sites as the agreed starting point.
    # Either site can move its own row without affecting the other.
    op.bulk_insert(
        sa.table(
            "review_thresholds",
            sa.column("domain", sa.String),
            sa.column("pass_min", mysql.DOUBLE),
            sa.column("warn_min", mysql.DOUBLE),
            sa.column("basis", sa.String),
        ),
        [
            {"domain": None, "pass_min": 0.90, "warn_min": 0.80, "basis": "q1"},
            {"domain": "WXPJ", "pass_min": 0.90, "warn_min": 0.80, "basis": "q1"},
            {"domain": "PJXZ", "pass_min": 0.90, "warn_min": 0.80, "basis": "q1"},
        ],
    )

    # What the system worked out, kept apart from what a person decided, so a
    # later re-review never silently overwrites someone's judgement.
    op.add_column("lots", sa.Column("judgement", sa.String(10), nullable=True))
    op.add_column("lots", sa.Column("judged_yield", mysql.DOUBLE(), nullable=True))
    op.add_column("lots", sa.Column("confirmed_judgement", sa.String(10), nullable=True))
    op.add_column("lots", sa.Column("confirmed_by", sa.Integer, nullable=True))
    op.add_column("lots", sa.Column("confirmed_at", sa.DateTime, nullable=True))
    op.add_column("lots", sa.Column("confirm_note", sa.Text, nullable=True))


def downgrade() -> None:
    for col in ("confirm_note", "confirmed_at", "confirmed_by",
                "confirmed_judgement", "judged_yield", "judgement"):
        op.drop_column("lots", col)
    op.drop_table("review_thresholds")

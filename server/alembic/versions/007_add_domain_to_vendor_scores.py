"""Add domain (AD site / 廠區) to vendor_scores so scores are per-site

Revision ID: 007
Revises: 006
"""
from alembic import op
import sqlalchemy as sa

revision = "007"
down_revision = "006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent + correctly ordered: MySQL keeps the vendor_id FK on the
    # (vendor_id, period) unique index, so the NEW unique (whose leftmost column
    # is still vendor_id) must exist BEFORE the old one can be dropped.
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("vendor_scores")}
    indexes = {i["name"] for i in insp.get_indexes("vendor_scores")}
    uniques = {u["name"] for u in insp.get_unique_constraints("vendor_scores")}

    if "domain" not in cols:
        op.add_column("vendor_scores", sa.Column("domain", sa.String(20), nullable=True))
    if "ix_vendor_scores_domain" not in indexes:
        op.create_index("ix_vendor_scores_domain", "vendor_scores", ["domain"])
    if "uq_vendor_period_domain" not in uniques:
        op.create_unique_constraint(
            "uq_vendor_period_domain", "vendor_scores", ["vendor_id", "period", "domain"]
        )
    if "uq_vendor_period" in uniques or "uq_vendor_period" in indexes:
        op.drop_constraint("uq_vendor_period", "vendor_scores", type_="unique")


def downgrade() -> None:
    op.drop_constraint("uq_vendor_period_domain", "vendor_scores", type_="unique")
    op.create_unique_constraint("uq_vendor_period", "vendor_scores", ["vendor_id", "period"])
    op.drop_index("ix_vendor_scores_domain", table_name="vendor_scores")
    op.drop_column("vendor_scores", "domain")

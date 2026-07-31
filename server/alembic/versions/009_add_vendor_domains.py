"""Add vendor_domains (which AD sites / 廠區 a vendor is visible to)

Revision ID: 009
Revises: 008
"""
from alembic import op
import sqlalchemy as sa

revision = "009"
down_revision = "008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    if "vendor_domains" in insp.get_table_names():
        return
    op.create_table(
        "vendor_domains",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("vendor_id", sa.Integer(), sa.ForeignKey("vendors.id"), nullable=False),
        sa.Column("domain", sa.String(20), nullable=False),
        sa.UniqueConstraint("vendor_id", "domain", name="uq_vendor_domain"),
    )
    op.create_index("ix_vendor_domains_domain", "vendor_domains", ["domain"])


def downgrade() -> None:
    op.drop_index("ix_vendor_domains_domain", table_name="vendor_domains")
    op.drop_table("vendor_domains")

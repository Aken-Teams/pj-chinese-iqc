"""Add domain (AD site / 廠區) to vendor_formats — templates are per-site

Revision ID: 010
Revises: 009
"""
from alembic import op
import sqlalchemy as sa

revision = "010"
down_revision = "009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("vendor_formats")}
    indexes = {i["name"] for i in insp.get_indexes("vendor_formats")}
    if "domain" not in cols:
        op.add_column("vendor_formats", sa.Column("domain", sa.String(20), nullable=True))
    if "ix_vendor_formats_domain" not in indexes:
        op.create_index("ix_vendor_formats_domain", "vendor_formats", ["domain"])


def downgrade() -> None:
    op.drop_index("ix_vendor_formats_domain", table_name="vendor_formats")
    op.drop_column("vendor_formats", "domain")

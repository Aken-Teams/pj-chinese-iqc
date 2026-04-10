"""Add product_id_cell and lot_id_cell to vendor_formats

Revision ID: 002
Revises: 001
"""
from alembic import op
import sqlalchemy as sa

revision = "002"
down_revision = "001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("vendor_formats",
                  sa.Column("product_id_cell", sa.String(20), nullable=True))
    op.add_column("vendor_formats",
                  sa.Column("lot_id_cell", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("vendor_formats", "lot_id_cell")
    op.drop_column("vendor_formats", "product_id_cell")

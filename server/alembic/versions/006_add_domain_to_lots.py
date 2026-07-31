"""Add domain (AD site / 廠區) to lots for per-site data isolation

Revision ID: 006
Revises: 005
"""
from alembic import op
import sqlalchemy as sa

revision = "006"
down_revision = "005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lots", sa.Column("domain", sa.String(20), nullable=True))
    op.create_index("ix_lots_domain", "lots", ["domain"])


def downgrade() -> None:
    op.drop_index("ix_lots_domain", table_name="lots")
    op.drop_column("lots", "domain")

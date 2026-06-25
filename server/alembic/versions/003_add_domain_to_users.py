"""Add domain to users

Revision ID: 003
Revises: 002
"""
from alembic import op
import sqlalchemy as sa

revision = "003"
down_revision = "002"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("domain", sa.String(20), nullable=True))


def downgrade() -> None:
    op.drop_column("users", "domain")

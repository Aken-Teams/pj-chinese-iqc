"""Add q1/q2/q3 combined (die-intersection) yields to wafers

Revision ID: 005
Revises: 004
"""
from alembic import op
import sqlalchemy as sa

revision = "005"
down_revision = "004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("wafers", sa.Column("q1_combined", sa.Numeric(6, 4), nullable=True))
    op.add_column("wafers", sa.Column("q2_combined", sa.Numeric(6, 4), nullable=True))
    op.add_column("wafers", sa.Column("q3_combined", sa.Numeric(6, 4), nullable=True))


def downgrade() -> None:
    op.drop_column("wafers", "q3_combined")
    op.drop_column("wafers", "q2_combined")
    op.drop_column("wafers", "q1_combined")

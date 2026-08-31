"""Make the spec-limit rows optional

A CP format without spec limits is legitimate, and a template being built in
the wizard is legitimately incomplete. Both used to hit a NOT NULL constraint
and surface as a 500 rather than as a field that still needs filling in.

Revision ID: 014
Revises: 013
"""
from alembic import op
import sqlalchemy as sa

revision = "014"
down_revision = "013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    for name in ("lower_limit_row", "upper_limit_row"):
        op.alter_column("vendor_formats", name,
                        existing_type=sa.Integer(), nullable=True)


def downgrade() -> None:
    # Rows without limits cannot satisfy the old constraint; point them at
    # row 1, which reads as empty for these formats anyway.
    op.execute("UPDATE vendor_formats SET lower_limit_row = 1 "
               "WHERE lower_limit_row IS NULL")
    op.execute("UPDATE vendor_formats SET upper_limit_row = 1 "
               "WHERE upper_limit_row IS NULL")
    for name in ("lower_limit_row", "upper_limit_row"):
        op.alter_column("vendor_formats", name,
                        existing_type=sa.Integer(), nullable=False)

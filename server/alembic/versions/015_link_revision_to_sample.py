"""Link each revision to the sample it was made against

A change to a template only makes sense next to the file it was made from —
"header_row 14 → 7" means nothing on its own, but a great deal when you can see
which sample was on screen at the time.

Revision ID: 015
Revises: 014
"""
from alembic import op
import sqlalchemy as sa

revision = "015"
down_revision = "014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("vendor_format_revisions")}
    if "sample_id" not in cols:
        op.add_column(
            "vendor_format_revisions",
            sa.Column("sample_id", sa.Integer,
                      sa.ForeignKey("vendor_format_samples.id"), nullable=True))


def downgrade() -> None:
    op.drop_column("vendor_format_revisions", "sample_id")

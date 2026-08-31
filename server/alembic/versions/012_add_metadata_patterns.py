"""Regex refinement for the lot / product metadata fields

世界先进 writes its LOT ID as "H2XR46.1-01" — the lot with the wafer number
appended. Read verbatim, each of a lot's five wafers imports as its own
single-wafer lot, which silently breaks lot-level review, Cpk and yield trends.
A pattern lets the template strip the suffix, the same way wafer_id_pattern
already refines the wafer id.

Revision ID: 012
Revises: 011
"""
from alembic import op
import sqlalchemy as sa

revision = "012"
down_revision = "011"
branch_labels = None
depends_on = None

NEW = [("product_id_pattern", sa.String(200)), ("lot_id_pattern", sa.String(200))]


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("vendor_formats")}
    for name, type_ in NEW:
        if name not in cols:
            op.add_column("vendor_formats", sa.Column(name, type_, nullable=True))


def downgrade() -> None:
    for name, _type in reversed(NEW):
        op.drop_column("vendor_formats", name)

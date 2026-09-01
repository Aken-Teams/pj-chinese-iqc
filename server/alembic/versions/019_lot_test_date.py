"""When the wafer was tested, as opposed to when the file was uploaded.

議題四 asks for a yield trend along a time axis. `lots.upload_time` cannot carry
it: 無錫's entire history arrived in one import, so every lot shares a timestamp
and the trend collapses to a vertical line. The date the lot was actually
tested is in the files already, in a different place for each vendor:

    东部高科   "Test End Time" column      2026-01-27 10:27:53
    天狼芯     "Date" cell                 Start 2026.07.09 15:13
    新洁能     "Date" cell                 2025/12/30
    祥微       "START_TIME" column         2026-06-13 13:40:22
    禾纳       "Date" cell                 2026-02-09
    世界先进   none found

So it is described per format, the same way the lot and product ids already are:
a label to anchor on, a fixed cell, or a column. Lots keep NULL where the file
says nothing, and the trend falls back to the upload time for those.

Revision ID: 019
Revises: 018
"""
from alembic import op
import sqlalchemy as sa

revision = "019"
down_revision = "018"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("lots", sa.Column("test_date", sa.DateTime, nullable=True))
    op.create_index("ix_lots_test_date", "lots", ["test_date"])

    # Mirrors the existing lot_id_* trio: anchor on a label, read a fixed cell,
    # or take a column. Which one a vendor needs depends on where they put it.
    op.add_column("vendor_formats", sa.Column("test_date_label", sa.String(100), nullable=True))
    op.add_column("vendor_formats", sa.Column("test_date_cell", sa.String(20), nullable=True))
    op.add_column("vendor_formats", sa.Column("test_date_col", sa.Integer, nullable=True))


def downgrade() -> None:
    op.drop_column("vendor_formats", "test_date_col")
    op.drop_column("vendor_formats", "test_date_cell")
    op.drop_column("vendor_formats", "test_date_label")
    op.drop_index("ix_lots_test_date", table_name="lots")
    op.drop_column("lots", "test_date")

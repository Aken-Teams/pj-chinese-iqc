"""Flexible layout descriptors for vendor_formats

Widens the template model so it can describe the CP formats found in the
2026-08 無錫 survey (six vendors, none alike):

  * wafer id is not always a column — it can sit in a metadata cell (天狼芯),
    next to a label whose row drifts (禾纳), only in the file name
    (世界先进, 新洁能), or nowhere at all (one wafer per file).
  * the header can be split over two rows: parameter names and id-column
    names (东部高科 r10 + r14).
  * electrical columns are not always contiguous from a start column
    (东部高科 has two limit-less PSCAN columns inside the block).
  * text dumps arrive tab- or comma-delimited.

Revision ID: 011
Revises: 010
"""
from alembic import op
import sqlalchemy as sa

revision = "011"
down_revision = "010"
branch_labels = None
depends_on = None


NEW_COLUMNS = [
    ("wafer_id_source", sa.String(20), {"nullable": False, "server_default": "column"}),
    ("wafer_id_cell", sa.String(20), {"nullable": True}),
    ("wafer_id_label", sa.String(100), {"nullable": True}),
    ("wafer_id_pattern", sa.String(200), {"nullable": True}),
    ("product_id_label", sa.String(100), {"nullable": True}),
    ("lot_id_label", sa.String(100), {"nullable": True}),
    ("id_header_row", sa.Integer(), {"nullable": True}),
    ("unit_row", sa.Integer(), {"nullable": True}),
    ("sheet_selector", sa.String(100), {"nullable": True}),
    ("param_cols", sa.JSON(), {"nullable": True}),
    ("text_delimiter", sa.String(10), {"nullable": True}),
]


def upgrade() -> None:
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("vendor_formats")}
    for name, type_, kw in NEW_COLUMNS:
        if name not in cols:
            op.add_column("vendor_formats", sa.Column(name, type_, **kw))

    # Existing templates all describe column-sourced wafer ids; make that
    # explicit so the parser never has to guess for legacy rows.
    op.execute(
        "UPDATE vendor_formats SET wafer_id_source = 'column' "
        "WHERE wafer_id_source IS NULL OR wafer_id_source = ''"
    )

    # wafer_id_col becomes optional — only the 'column' source needs it.
    op.alter_column(
        "vendor_formats", "wafer_id_col",
        existing_type=sa.Integer(), nullable=True,
    )


def downgrade() -> None:
    # Rows that do not carry a per-row wafer id column cannot satisfy the old
    # NOT NULL constraint; drop them to a sentinel so the column can tighten.
    op.execute("UPDATE vendor_formats SET wafer_id_col = 1 WHERE wafer_id_col IS NULL")
    op.alter_column(
        "vendor_formats", "wafer_id_col",
        existing_type=sa.Integer(), nullable=False,
    )
    for name, _type, _kw in reversed(NEW_COLUMNS):
        op.drop_column("vendor_formats", name)

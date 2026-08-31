"""Sample retention, revision history, and file-name metadata fallback

Three things the template wizard needs to stop being write-only:

* `vendor_format_samples` keeps the sample file a template was built from, so
  the preview can be reopened without hunting for the file again — which the
  無錫 users cannot reliably do, their file names arriving mojibake.
* `vendor_format_revisions` records every saved version so a template change
  can be reviewed and rolled back; a bad template silently breaks every upload
  for that vendor.
* `product_id_filename_pattern` / `lot_id_filename_pattern` extract metadata
  from the file name, but only when the file's own contents yield nothing. As a
  fallback it puts a naming convention on just the files that need one.

Revision ID: 013
Revises: 012
"""
from alembic import op
import sqlalchemy as sa

revision = "013"
down_revision = "012"
branch_labels = None
depends_on = None

NEW_COLUMNS = [
    ("product_id_filename_pattern", sa.String(200)),
    ("lot_id_filename_pattern", sa.String(200)),
]


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    cols = {c["name"] for c in insp.get_columns("vendor_formats")}
    for name, type_ in NEW_COLUMNS:
        if name not in cols:
            op.add_column("vendor_formats", sa.Column(name, type_, nullable=True))

    tables = set(insp.get_table_names())
    if "vendor_format_samples" not in tables:
        op.create_table(
            "vendor_format_samples",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("vendor_format_id", sa.Integer,
                      sa.ForeignKey("vendor_formats.id"), nullable=False, index=True),
            sa.Column("file_name", sa.String(255), nullable=False),
            sa.Column("stored_name", sa.String(255), nullable=False),
            sa.Column("sheet_selector", sa.String(100)),
            sa.Column("uploaded_by", sa.Integer, sa.ForeignKey("users.id")),
            sa.Column("uploaded_at", sa.DateTime, server_default=sa.func.now()),
        )
    if "vendor_format_revisions" not in tables:
        op.create_table(
            "vendor_format_revisions",
            sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
            sa.Column("vendor_format_id", sa.Integer,
                      sa.ForeignKey("vendor_formats.id"), nullable=False, index=True),
            sa.Column("snapshot", sa.JSON, nullable=False),
            sa.Column("action", sa.String(20), nullable=False,
                      server_default="update"),
            sa.Column("changed_by", sa.Integer, sa.ForeignKey("users.id")),
            sa.Column("changed_at", sa.DateTime, server_default=sa.func.now()),
            sa.Column("note", sa.String(200)),
        )


def downgrade() -> None:
    op.drop_table("vendor_format_revisions")
    op.drop_table("vendor_format_samples")
    for name, _type in reversed(NEW_COLUMNS):
        op.drop_column("vendor_formats", name)

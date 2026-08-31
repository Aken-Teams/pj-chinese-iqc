"""Version history for the review rules of a site.

The rules are maintained by sending a spreadsheet out to a site, having them
fill it in, and importing it back. Without a version, nobody can say which
sheet a set of limits came from, and an export carries no identity — the two
sites were already sending files that could not be told apart.

Each import bumps the site's version. An export names the version it was taken
from, so a returned file can be traced to what it was based on.

Revision ID: 018
Revises: 017
"""
from alembic import op
import sqlalchemy as sa

revision = "018"
down_revision = "017"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "rule_revisions",
        sa.Column("id", sa.Integer, primary_key=True, autoincrement=True),
        sa.Column("domain", sa.String(20), nullable=True, index=True),
        # 1-based and per site, so 無錫 v3 and 徐州 v3 are different rulesets.
        sa.Column("version", sa.Integer, nullable=False),
        sa.Column("action", sa.String(20), nullable=False),   # import | clear | edit
        sa.Column("file_name", sa.String(255)),
        sa.Column("changed_by", sa.Integer),
        sa.Column("changed_at", sa.DateTime, server_default=sa.func.now()),
        sa.Column("note", sa.Text),
        sa.Column("rules_before", sa.Integer),
        sa.Column("rules_after", sa.Integer),
        # [{product, param, field, from, to}] — enough to render a diff table
        # without keeping a second copy of every ruleset.
        sa.Column("changes", sa.JSON),
    )


def downgrade() -> None:
    op.drop_table("rule_revisions")

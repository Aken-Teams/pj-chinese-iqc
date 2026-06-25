"""Add ai_token_usage table

Revision ID: 004
Revises: 003
"""
from alembic import op
import sqlalchemy as sa

revision = "004"
down_revision = "003"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_token_usage",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column("feature", sa.String(50), nullable=False),
        sa.Column("model", sa.String(50), nullable=False),
        sa.Column("prompt_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("completion_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("total_tokens", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("lang", sa.String(10), nullable=True),
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("lot_id", sa.Integer(), nullable=True),
        sa.Column("wafer_id", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index("ix_ai_token_usage_created_at", "ai_token_usage", ["created_at"])
    op.create_index("ix_ai_token_usage_feature", "ai_token_usage", ["feature"])


def downgrade() -> None:
    op.drop_index("ix_ai_token_usage_feature", table_name="ai_token_usage")
    op.drop_index("ix_ai_token_usage_created_at", table_name="ai_token_usage")
    op.drop_table("ai_token_usage")

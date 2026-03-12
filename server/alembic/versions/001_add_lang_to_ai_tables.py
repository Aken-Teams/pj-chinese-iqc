"""add lang column to ai_anomalies and ai_review_summaries

Revision ID: 001
Revises:
Create Date: 2026-03-12
"""
from alembic import op
import sqlalchemy as sa

revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        'ai_anomalies',
        sa.Column('lang', sa.String(10), nullable=False, server_default='zh-TW'),
    )
    op.add_column(
        'ai_review_summaries',
        sa.Column('lang', sa.String(10), nullable=False, server_default='zh-TW'),
    )


def downgrade() -> None:
    op.drop_column('ai_anomalies', 'lang')
    op.drop_column('ai_review_summaries', 'lang')

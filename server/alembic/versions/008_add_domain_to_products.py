"""Add domain (AD site / 廠區) to products; product_code unique per site

Revision ID: 008
Revises: 007
"""
from alembic import op
import sqlalchemy as sa

revision = "008"
down_revision = "007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Idempotent: the app's create_all won't alter an existing table, and a
    # failed partial run must be safe to re-apply.
    insp = sa.inspect(op.get_bind())
    cols = {c["name"] for c in insp.get_columns("products")}
    indexes = {i["name"] for i in insp.get_indexes("products")}
    uniques = {u["name"] for u in insp.get_unique_constraints("products")}

    if "domain" not in cols:
        op.add_column("products", sa.Column("domain", sa.String(20), nullable=True))
    if "ix_products_domain" not in indexes:
        op.create_index("ix_products_domain", "products", ["domain"])
    # New composite unique first (its leftmost col is product_code), then drop
    # the old single-column unique — avoids any dependent-index removal error.
    if "uq_product_code_domain" not in uniques:
        op.create_unique_constraint(
            "uq_product_code_domain", "products", ["product_code", "domain"]
        )
    # The old column-level unique index is named "product_code" by MySQL.
    if "product_code" in uniques or "product_code" in indexes:
        op.drop_constraint("product_code", "products", type_="unique")


def downgrade() -> None:
    op.create_unique_constraint("product_code", "products", ["product_code"])
    op.drop_constraint("uq_product_code_domain", "products", type_="unique")
    op.drop_index("ix_products_domain", table_name="products")
    op.drop_column("products", "domain")

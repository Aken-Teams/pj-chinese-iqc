"""Store measurements and limits as DOUBLE instead of NUMERIC(15,6).

CP data spans volts (1e0) down to picoamps (1e-12). NUMERIC(15,6) cannot hold
anything below 1e-6, so every leakage reading and every leakage limit rounded to
exactly zero: 100.0nA became 0.000000. Measured against a limit of zero under
the engine's strict inequality, every die then failed, and 新潔能's Q1 yield came
out as 0.00% on wafers whose bin yield was 99%.

Counted from the source files: 55.7% of 新潔能's readings and 26.0% of 禾納's
were non-zero in the file and stored as zero. Whole parameters were lost —
Idss40 154 of 154, IDSS2 300 of 300.

A fixed-point type would need an absurd scale to cover volts through picoamps at
once, so measurements move to floating point. Yields stay NUMERIC(6,4): they are
bounded 0..1 and four places is the right resolution there.

Values already flattened to zero are not recoverable here — the rows must be
re-imported from the original files after this runs.

Revision ID: 016
Revises: 015
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import mysql

revision = "016"
down_revision = "015"
branch_labels = None
depends_on = None

DOUBLE = mysql.DOUBLE()
NUMERIC = sa.Numeric(15, 6)

# (table, column, nullable) — every column holding a measurement or a limit.
COLUMNS = [
    ("cp_specs", "lower_limit", True),
    ("cp_specs", "upper_limit", True),
    ("review_rules", "q1_lower", True),
    ("review_rules", "q1_upper", True),
    ("review_rules", "q2_lower", True),
    ("review_rules", "q2_upper", True),
    ("review_rules", "q3_lower", True),
    ("review_rules", "q3_upper", True),
    ("packaging_specs", "lower_limit", True),
    ("packaging_specs", "upper_limit", True),
    ("spec_comparisons", "cp_lower", True),
    ("spec_comparisons", "cp_upper", True),
    ("spec_comparisons", "pkg_lower", True),
    ("spec_comparisons", "pkg_upper", True),
    ("spec_comparisons", "internal_lower", True),
    ("spec_comparisons", "internal_upper", True),
    # Statistics derived from the readings, so they carry the same range.
    ("review_results", "average", True),
    ("review_results", "stdev", True),
    ("review_results", "max_val", True),
    ("review_results", "min_val", True),
    # The readings themselves. Largest table in the schema — expect this one
    # to dominate the migration's runtime.
    ("electrical_values", "value", True),
]


def upgrade() -> None:
    for table, column, nullable in COLUMNS:
        op.alter_column(table, column, existing_type=NUMERIC,
                        type_=DOUBLE, existing_nullable=nullable)


def downgrade() -> None:
    for table, column, nullable in COLUMNS:
        op.alter_column(table, column, existing_type=DOUBLE,
                        type_=NUMERIC, existing_nullable=nullable)

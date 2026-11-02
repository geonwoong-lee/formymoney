"""Add daily snapshots of 금융감독원 deposit and savings product rates.

Revision ID: 20261102_0013
Revises: 20261102_0012
Create Date: 2026-11-02
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261102_0013"
down_revision: str | Sequence[str] | None = "20261102_0012"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_rate_snapshots",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("group", sa.String(length=20), nullable=False),
        sa.Column("company", sa.String(length=100), nullable=False),
        sa.Column("product_code", sa.String(length=60), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("term_months", sa.Integer(), nullable=False),
        sa.Column("rate_type", sa.String(length=20), nullable=False),
        sa.Column("reserve_type", sa.String(length=20), nullable=False),
        sa.Column("base_rate", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("max_rate", sa.Numeric(precision=6, scale=2), nullable=True),
        sa.Column("disclosed_month", sa.String(length=6), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "day", "kind", "product_code", "company", "term_months", "rate_type", "reserve_type", name="uq_product_rate_snapshot",
        ),
    )
    op.create_index("ix_product_rate_snapshots_day", "product_rate_snapshots", ["day"])


def downgrade() -> None:
    op.drop_index("ix_product_rate_snapshots_day", table_name="product_rate_snapshots")
    op.drop_table("product_rate_snapshots")

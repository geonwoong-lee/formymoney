"""Add market indicator values from Bank of Korea ECOS.

Revision ID: 20261102_0008
Revises: 20261102_0007
Create Date: 2026-11-02
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261102_0008"
down_revision: str | Sequence[str] | None = "20261102_0007"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "market_points",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("series_code", sa.String(length=40), nullable=False),
        sa.Column("period", sa.String(length=8), nullable=False),
        sa.Column("value", sa.Numeric(precision=18, scale=4), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("series_code", "period", name="uq_market_points_series_period"),
    )
    op.create_index("ix_market_points_series_code", "market_points", ["series_code"])


def downgrade() -> None:
    op.drop_index("ix_market_points_series_code", table_name="market_points")
    op.drop_table("market_points")

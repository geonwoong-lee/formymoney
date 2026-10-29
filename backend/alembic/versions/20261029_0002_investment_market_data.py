"""Add investment assets and monthly market points.

Revision ID: 20261029_0002
Revises: 20261028_0001
Create Date: 2026-10-29
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261029_0002"
down_revision: str | Sequence[str] | None = "20261028_0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "investment_assets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=30), nullable=False),
        sa.Column("ticker", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("benchmark", sa.String(length=150), nullable=False),
        sa.Column("leveraged", sa.Boolean(), nullable=False),
        sa.Column("expense_ratio_percent", sa.Numeric(precision=6, scale=3), nullable=False),
        sa.Column("distribution_policy", sa.String(length=50), nullable=False),
        sa.Column("provider_source_url", sa.String(length=500), nullable=False),
        sa.Column("price_source_url", sa.String(length=500), nullable=False),
        sa.Column("fx_source_url", sa.String(length=500), nullable=False),
        sa.Column("source_date", sa.String(length=10), nullable=False),
        sa.Column("warning", sa.Text(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("ticker"),
    )
    op.create_index(op.f("ix_investment_assets_code"), "investment_assets", ["code"], unique=True)
    op.create_table(
        "investment_monthly_points",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("asset_id", sa.Integer(), nullable=False),
        sa.Column("month", sa.String(length=7), nullable=False),
        sa.Column("adjusted_close", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.Column("usd_krw", sa.Numeric(precision=18, scale=6), nullable=False),
        sa.ForeignKeyConstraint(["asset_id"], ["investment_assets.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("asset_id", "month"),
    )


def downgrade() -> None:
    op.drop_table("investment_monthly_points")
    op.drop_index(op.f("ix_investment_assets_code"), table_name="investment_assets")
    op.drop_table("investment_assets")

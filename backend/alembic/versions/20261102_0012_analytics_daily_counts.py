"""Add anonymous daily usage counts (consented users only, no identifiers).

Revision ID: 20261102_0012
Revises: 20261102_0011
Create Date: 2026-11-02
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261102_0012"
down_revision: str | Sequence[str] | None = "20261102_0011"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "analytics_daily_counts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("event", sa.String(length=40), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("day", "event", name="uq_analytics_daily_counts_day_event"),
    )
    op.create_index("ix_analytics_daily_counts_day", "analytics_daily_counts", ["day"])


def downgrade() -> None:
    op.drop_index("ix_analytics_daily_counts_day", table_name="analytics_daily_counts")
    op.drop_table("analytics_daily_counts")

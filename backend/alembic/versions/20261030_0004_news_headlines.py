"""Add short-lived news headlines (title and link only).

Revision ID: 20261030_0004
Revises: 20261029_0003
Create Date: 2026-10-30
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261030_0004"
down_revision: str | Sequence[str] | None = "20261029_0003"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "news_headlines",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=30), nullable=False),
        sa.Column("region", sa.String(length=20), nullable=False),
        sa.Column("topic", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=500), nullable=False),
        sa.Column("publisher", sa.String(length=255), nullable=False),
        sa.Column("url", sa.String(length=1000), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("region IN ('domestic', 'international')", name="ck_news_headline_region"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("url"),
    )
    op.create_index(op.f("ix_news_headlines_region"), "news_headlines", ["region"])
    op.create_index(op.f("ix_news_headlines_published_at"), "news_headlines", ["published_at"])
    op.create_index(op.f("ix_news_headlines_fetched_at"), "news_headlines", ["fetched_at"])


def downgrade() -> None:
    op.drop_index(op.f("ix_news_headlines_fetched_at"), table_name="news_headlines")
    op.drop_index(op.f("ix_news_headlines_published_at"), table_name="news_headlines")
    op.drop_index(op.f("ix_news_headlines_region"), table_name="news_headlines")
    op.drop_table("news_headlines")

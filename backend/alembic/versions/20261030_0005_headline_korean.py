"""Add Korean interpretation fields to news headlines.

Revision ID: 20261030_0005
Revises: 20261030_0004
Create Date: 2026-10-30
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261030_0005"
down_revision: str | Sequence[str] | None = "20261030_0004"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("news_headlines", sa.Column("title_ko", sa.String(length=500), nullable=True))
    op.add_column("news_headlines", sa.Column("summary_ko", sa.Text(), nullable=True))
    op.add_column("news_headlines", sa.Column("ai_model", sa.String(length=120), nullable=True))


def downgrade() -> None:
    op.drop_column("news_headlines", "ai_model")
    op.drop_column("news_headlines", "summary_ko")
    op.drop_column("news_headlines", "title_ko")

"""Add what today's news can mean for savers to the daily news digest.

Revision ID: 20261102_0009
Revises: 20261102_0008
Create Date: 2026-11-02
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261102_0009"
down_revision: str | Sequence[str] | None = "20261102_0008"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("news_digests", sa.Column("money_notes", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("news_digests", "money_notes")

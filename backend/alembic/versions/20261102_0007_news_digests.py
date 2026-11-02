"""Add the daily economy news digest.

Revision ID: 20261102_0007
Revises: 20261030_0006
Create Date: 2026-11-02
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261102_0007"
down_revision: str | Sequence[str] | None = "20261030_0006"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "news_digests",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("digest_date", sa.Date(), nullable=False),
        sa.Column("overview", sa.Text(), nullable=False),
        sa.Column("points", sa.JSON(), nullable=False),
        sa.Column("ai_model", sa.String(length=120), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("digest_date"),
    )


def downgrade() -> None:
    op.drop_table("news_digests")

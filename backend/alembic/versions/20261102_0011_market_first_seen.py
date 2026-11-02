"""Record when each market value first arrived, for "new figure" notices.

Revision ID: 20261102_0011
Revises: 20261102_0010
Create Date: 2026-11-02
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261102_0011"
down_revision: str | Sequence[str] | None = "20261102_0010"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.add_column("market_points", sa.Column("first_seen_at", sa.DateTime(timezone=True), nullable=True))


def downgrade() -> None:
    op.drop_column("market_points", "first_seen_at")

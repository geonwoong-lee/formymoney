"""Add saved watchlists: starred products a signed-in user chose to keep on their account.

Revision ID: 20261103_0017
Revises: 20261103_0016
Create Date: 2026-11-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261103_0017"
down_revision: str | Sequence[str] | None = "20261103_0016"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_watchlists",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("items", sa.JSON(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", name="uq_saved_watchlists_user_id"),
    )


def downgrade() -> None:
    op.drop_table("saved_watchlists")

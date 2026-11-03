"""Add plans that signed-in users chose to save.

Revision ID: 20261103_0014
Revises: 20261102_0013
Create Date: 2026-11-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261103_0014"
down_revision: str | Sequence[str] | None = "20261102_0013"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "saved_plans",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("draft", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_saved_plans_user_id", "saved_plans", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_saved_plans_user_id", table_name="saved_plans")
    op.drop_table("saved_plans")

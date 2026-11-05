"""Add condition answer counts: anonymous daily counts of preferential condition answers (yes/no/unknown) by bank.

Revision ID: 20261105_0020
Revises: 20261104_0019
Create Date: 2026-11-05
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261105_0020"
down_revision: str | Sequence[str] | None = "20261104_0019"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "condition_answer_daily_counts",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("bank_code", sa.String(length=30), nullable=False),
        sa.Column("condition_code", sa.String(length=50), nullable=False),
        sa.Column("answer", sa.String(length=10), nullable=False),
        sa.Column("count", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("day", "bank_code", "condition_code", "answer", name="uq_condition_answer_daily_counts_key"),
    )
    op.create_index("ix_condition_answer_daily_counts_day", "condition_answer_daily_counts", ["day"])


def downgrade() -> None:
    op.drop_index("ix_condition_answer_daily_counts_day", table_name="condition_answer_daily_counts")
    op.drop_table("condition_answer_daily_counts")

"""Add product joining terms (who, how, limit, bonus-rate conditions) from the 금감원 disclosure.

Revision ID: 20261103_0016
Revises: 20261103_0015
Create Date: 2026-11-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261103_0016"
down_revision: str | Sequence[str] | None = "20261103_0015"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "product_infos",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(length=10), nullable=False),
        sa.Column("company", sa.String(length=100), nullable=False),
        sa.Column("product_code", sa.String(length=60), nullable=False),
        sa.Column("join_way", sa.String(length=200), nullable=False),
        sa.Column("join_member", sa.Text(), nullable=False),
        sa.Column("join_limit", sa.String(length=20), nullable=False),
        sa.Column("special_conditions", sa.Text(), nullable=False),
        sa.Column("max_limit", sa.BigInteger(), nullable=True),
        sa.Column("etc_note", sa.Text(), nullable=False),
        sa.Column("maturity_interest", sa.Text(), nullable=False),
        sa.Column("updated_on", sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("kind", "company", "product_code", name="uq_product_info"),
    )


def downgrade() -> None:
    op.drop_table("product_infos")

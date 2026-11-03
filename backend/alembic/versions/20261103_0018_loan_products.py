"""Add loan products: rent deposit loans as 금융감독원 disclosed them.

Revision ID: 20261103_0018
Revises: 20261103_0017
Create Date: 2026-11-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261103_0018"
down_revision: str | Sequence[str] | None = "20261103_0017"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "loan_products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("group", sa.String(length=20), nullable=False),
        sa.Column("company", sa.String(length=100), nullable=False),
        sa.Column("product_code", sa.String(length=60), nullable=False),
        sa.Column("product_name", sa.String(length=200), nullable=False),
        sa.Column("repay_type", sa.String(length=30), nullable=False),
        sa.Column("rate_type", sa.String(length=20), nullable=False),
        sa.Column("rate_min", sa.Numeric(6, 2), nullable=True),
        sa.Column("rate_max", sa.Numeric(6, 2), nullable=True),
        sa.Column("loan_limit", sa.Text(), nullable=False),
        sa.Column("early_repay_fee", sa.Text(), nullable=False),
        sa.Column("delay_rate", sa.Text(), nullable=False),
        sa.Column("join_way", sa.String(length=200), nullable=False),
        sa.Column("disclosed_month", sa.String(length=6), nullable=False),
        sa.Column("updated_on", sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("company", "product_code", "repay_type", "rate_type", name="uq_loan_product"),
    )
    op.create_index(op.f("ix_loan_products_updated_on"), "loan_products", ["updated_on"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_loan_products_updated_on"), table_name="loan_products")
    op.drop_table("loan_products")

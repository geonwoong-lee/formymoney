"""Create the existing Very Rich reference-data schema.

Revision ID: 20261028_0001
Revises:
Create Date: 2026-10-28
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261028_0001"
down_revision: str | Sequence[str] | None = None
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "reference_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("label", sa.String(length=200), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_reference_items_key"), "reference_items", ["key"], unique=True)

    op.create_table(
        "savings_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("term_months", sa.Integer(), nullable=False),
        sa.Column("minimum_monthly_amount", sa.Integer(), nullable=False),
        sa.Column("maximum_monthly_amount", sa.Integer(), nullable=False),
        sa.Column("annual_limit", sa.Integer(), nullable=False),
        sa.Column("general_contribution_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("preferred_contribution_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("tax_exempt", sa.Boolean(), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=False),
        sa.Column("source_date", sa.String(length=10), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_savings_policies_code"), "savings_policies", ["code"], unique=True)

    op.create_table(
        "bank_savings_products",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_code", sa.String(length=30), nullable=False),
        sa.Column("bank_name", sa.String(length=100), nullable=False),
        sa.Column("product_name", sa.String(length=100), nullable=False),
        sa.Column("base_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("maximum_bonus_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=False),
        sa.Column("source_date", sa.String(length=10), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_bank_savings_products_bank_code"),
        "bank_savings_products",
        ["bank_code"],
        unique=True,
    )

    op.create_table(
        "preferential_conditions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=100), nullable=False),
        sa.Column("bonus_rate", sa.Numeric(precision=5, scale=2), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("requires_additional_review", sa.Boolean(), nullable=False),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["bank_savings_products.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("product_id", "code"),
    )


def downgrade() -> None:
    op.drop_table("preferential_conditions")
    op.drop_index(op.f("ix_bank_savings_products_bank_code"), table_name="bank_savings_products")
    op.drop_table("bank_savings_products")
    op.drop_index(op.f("ix_savings_policies_code"), table_name="savings_policies")
    op.drop_table("savings_policies")
    op.drop_index(op.f("ix_reference_items_key"), table_name="reference_items")
    op.drop_table("reference_items")

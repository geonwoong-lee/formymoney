"""Add youth policies: 온통청년 policies as the API listed them.

Revision ID: 20261104_0019
Revises: 20261103_0018
Create Date: 2026-11-04
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261104_0019"
down_revision: str | Sequence[str] | None = "20261103_0018"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "youth_policies",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("policy_no", sa.String(length=30), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("keywords", sa.String(length=300), nullable=False),
        sa.Column("summary", sa.Text(), nullable=False),
        sa.Column("support", sa.Text(), nullable=False),
        sa.Column("category", sa.String(length=100), nullable=False),
        sa.Column("subcategory", sa.String(length=150), nullable=False),
        sa.Column("min_age", sa.Integer(), nullable=True),
        sa.Column("max_age", sa.Integer(), nullable=True),
        sa.Column("income_note", sa.Text(), nullable=False),
        sa.Column("extra_conditions", sa.Text(), nullable=False),
        sa.Column("apply_start", sa.Date(), nullable=True),
        sa.Column("apply_end", sa.Date(), nullable=True),
        sa.Column("apply_method", sa.Text(), nullable=False),
        sa.Column("selection", sa.Text(), nullable=False),
        sa.Column("institution", sa.String(length=200), nullable=False),
        sa.Column("apply_url", sa.Text(), nullable=False),
        sa.Column("ref_url", sa.Text(), nullable=False),
        sa.Column("regions", sa.String(length=80), nullable=False),
        sa.Column("nationwide", sa.Boolean(), nullable=False),
        sa.Column("modified_on", sa.Date(), nullable=True),
        sa.Column("updated_on", sa.Date(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("policy_no"),
    )
    op.create_index(op.f("ix_youth_policies_category"), "youth_policies", ["category"], unique=False)
    op.create_index(op.f("ix_youth_policies_apply_end"), "youth_policies", ["apply_end"], unique=False)
    op.create_index(op.f("ix_youth_policies_updated_on"), "youth_policies", ["updated_on"], unique=False)


def downgrade() -> None:
    op.drop_index(op.f("ix_youth_policies_updated_on"), table_name="youth_policies")
    op.drop_index(op.f("ix_youth_policies_apply_end"), table_name="youth_policies")
    op.drop_index(op.f("ix_youth_policies_category"), table_name="youth_policies")
    op.drop_table("youth_policies")

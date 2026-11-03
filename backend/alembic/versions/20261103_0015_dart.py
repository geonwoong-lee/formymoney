"""Add DART bank main accounts and bank/holding company filings.

Revision ID: 20261103_0015
Revises: 20261103_0014
Create Date: 2026-11-03
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261103_0015"
down_revision: str | Sequence[str] | None = "20261103_0014"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "bank_financials",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bank_code", sa.String(length=30), nullable=False),
        sa.Column("corp_code", sa.String(length=8), nullable=False),
        sa.Column("corp_name", sa.String(length=100), nullable=False),
        sa.Column("year", sa.Integer(), nullable=False),
        sa.Column("fs_div", sa.String(length=3), nullable=False),
        sa.Column("period_end", sa.String(length=20), nullable=False),
        sa.Column("receipt_no", sa.String(length=20), nullable=False),
        sa.Column("current", sa.JSON(), nullable=False),
        sa.Column("previous", sa.JSON(), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bank_code", name="uq_bank_financials_bank_code"),
    )
    op.create_table(
        "dart_filings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("receipt_no", sa.String(length=20), nullable=False),
        sa.Column("corp_code", sa.String(length=8), nullable=False),
        sa.Column("corp_name", sa.String(length=100), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("filed_on", sa.Date(), nullable=False),
        sa.Column("filer", sa.String(length=100), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("receipt_no", name="uq_dart_filings_receipt_no"),
    )
    op.create_index("ix_dart_filings_corp_code", "dart_filings", ["corp_code"])
    op.create_index("ix_dart_filings_filed_on", "dart_filings", ["filed_on"])


def downgrade() -> None:
    op.drop_index("ix_dart_filings_filed_on", table_name="dart_filings")
    op.drop_index("ix_dart_filings_corp_code", table_name="dart_filings")
    op.drop_table("dart_filings")
    op.drop_table("bank_financials")

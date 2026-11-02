"""Add collection run log for operator monitoring.

Revision ID: 20261030_0006
Revises: 20261030_0005
Create Date: 2026-10-30
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261030_0006"
down_revision: str | Sequence[str] | None = "20261030_0005"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    op.create_table(
        "collection_runs",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("run_id", sa.String(length=100), nullable=True),
        sa.Column("workflow", sa.String(length=60), nullable=False),
        sa.Column("status", sa.String(length=10), nullable=False),
        sa.Column("stage", sa.String(length=60), nullable=True),
        sa.Column("error_message", sa.String(length=300), nullable=True),
        sa.Column("candidates", sa.Integer(), nullable=False),
        sa.Column("published", sa.Integer(), nullable=False),
        sa.Column("rejected", sa.Integer(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("finished_at", sa.DateTime(timezone=True), nullable=False),
        sa.CheckConstraint("status IN ('success', 'partial', 'failed')", name="ck_collection_run_status"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", name="uq_collection_runs_run_id"),
    )
    op.create_index("ix_collection_runs_workflow", "collection_runs", ["workflow"])
    op.create_index("ix_collection_runs_status", "collection_runs", ["status"])
    op.create_index("ix_collection_runs_finished_at", "collection_runs", ["finished_at"])


def downgrade() -> None:
    op.drop_index("ix_collection_runs_finished_at", table_name="collection_runs")
    op.drop_index("ix_collection_runs_status", table_name="collection_runs")
    op.drop_index("ix_collection_runs_workflow", table_name="collection_runs")
    op.drop_table("collection_runs")

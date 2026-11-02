"""Add the knowledge base 머니독 searches (pgvector on PostgreSQL).

Revision ID: 20261102_0010
Revises: 20261102_0009
Create Date: 2026-11-02
"""

from collections.abc import Sequence

from alembic import op
import sqlalchemy as sa


revision: str = "20261102_0010"
down_revision: str | Sequence[str] | None = "20261102_0009"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

EMBEDDING_DIMENSIONS = 512


class _Vector(sa.types.UserDefinedType):
    cache_ok = True

    def get_col_spec(self, **_: object) -> str:
        return f"vector({EMBEDDING_DIMENSIONS})"


def upgrade() -> None:
    postgres = op.get_bind().dialect.name == "postgresql"
    if postgres:
        op.execute("CREATE EXTENSION IF NOT EXISTS vector")
    op.create_table(
        "knowledge_chunks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_key", sa.String(length=200), nullable=False),
        sa.Column("source_type", sa.String(length=20), nullable=False),
        sa.Column("title", sa.String(length=300), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("url", sa.String(length=500), nullable=True),
        sa.Column("published_on", sa.Date(), nullable=True),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("embedding", _Vector() if postgres else sa.JSON(), nullable=True),
        sa.Column("embedding_model", sa.String(length=80), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_key", name="uq_knowledge_chunks_source_key"),
    )
    op.create_index("ix_knowledge_chunks_source_type", "knowledge_chunks", ["source_type"])
    op.create_index("ix_knowledge_chunks_published_on", "knowledge_chunks", ["published_on"])


def downgrade() -> None:
    op.drop_index("ix_knowledge_chunks_published_on", table_name="knowledge_chunks")
    op.drop_index("ix_knowledge_chunks_source_type", table_name="knowledge_chunks")
    op.drop_table("knowledge_chunks")

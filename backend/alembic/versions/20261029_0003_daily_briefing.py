"""Add daily briefing sources, items, and reviewed financial terms.

Revision ID: 20261029_0003
Revises: 20261029_0002
Create Date: 2026-10-29
"""

from collections.abc import Sequence
from datetime import date

from alembic import op
import sqlalchemy as sa


revision: str = "20261029_0003"
down_revision: str | Sequence[str] | None = "20261029_0002"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    sources = op.create_table(
        "daily_briefing_sources",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("allowed_host", sa.String(length=255), nullable=False),
        sa.Column("allowed_path_prefix", sa.String(length=255), nullable=False),
        sa.Column("feed_url", sa.String(length=500), nullable=True),
        sa.Column("listing_url", sa.String(length=500), nullable=False),
        sa.Column("rights_url", sa.String(length=500), nullable=False),
        sa.Column("rights_checked_on", sa.Date(), nullable=False),
        sa.Column("usage_status", sa.String(length=30), nullable=False),
        sa.Column("summary_allowed", sa.Boolean(), nullable=False),
        sa.Column("active", sa.Boolean(), nullable=False),
        sa.CheckConstraint(
            "usage_status IN ('summary_allowed', 'discovery_only', 'candidate_only')",
            name="ck_daily_briefing_source_usage_status",
        ),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_daily_briefing_sources_code"), "daily_briefing_sources", ["code"], unique=True)

    op.create_table(
        "daily_briefing_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("source_item_id", sa.String(length=255), nullable=False),
        sa.Column("canonical_url", sa.String(length=1000), nullable=False),
        sa.Column("original_title", sa.String(length=500), nullable=False),
        sa.Column("published_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("content_sha256", sa.String(length=64), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("validation_errors", sa.JSON(), nullable=False),
        sa.Column("plain_headline", sa.String(length=500), nullable=False),
        sa.Column("summary_points", sa.JSON(), nullable=False),
        sa.Column("why_it_matters", sa.JSON(), nullable=False),
        sa.Column("related_terms", sa.JSON(), nullable=False),
        sa.Column("caution", sa.Text(), nullable=False),
        sa.Column("schema_version", sa.String(length=20), nullable=False),
        sa.Column("model_name", sa.String(length=120), nullable=False),
        sa.Column("prompt_version", sa.String(length=50), nullable=False),
        sa.Column("generated_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=False),
        sa.Column("output_tokens", sa.Integer(), nullable=False),
        sa.CheckConstraint(
            "status IN ('draft', 'validated', 'published', 'rejected')",
            name="ck_daily_briefing_item_status",
        ),
        sa.ForeignKeyConstraint(["source_id"], ["daily_briefing_sources.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("canonical_url"),
        sa.UniqueConstraint("content_sha256"),
        sa.UniqueConstraint("source_id", "source_item_id", name="uq_daily_briefing_source_item"),
    )
    op.create_index(op.f("ix_daily_briefing_items_published_at"), "daily_briefing_items", ["published_at"])
    op.create_index(op.f("ix_daily_briefing_items_source_id"), "daily_briefing_items", ["source_id"])
    op.create_index(op.f("ix_daily_briefing_items_status"), "daily_briefing_items", ["status"])

    op.create_table(
        "financial_terms",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("slug", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("short_definition", sa.Text(), nullable=False),
        sa.Column("example", sa.Text(), nullable=False),
        sa.Column("source_name", sa.String(length=120), nullable=False),
        sa.Column("source_url", sa.String(length=500), nullable=False),
        sa.Column("reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_reviewed", sa.Boolean(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_index(op.f("ix_financial_terms_is_reviewed"), "financial_terms", ["is_reviewed"])
    op.create_index(op.f("ix_financial_terms_slug"), "financial_terms", ["slug"], unique=True)

    op.create_table(
        "daily_term_assignments",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("briefing_date", sa.Date(), nullable=False),
        sa.Column("term_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["term_id"], ["financial_terms.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_daily_term_assignments_briefing_date"),
        "daily_term_assignments",
        ["briefing_date"],
        unique=True,
    )

    op.bulk_insert(
        sources,
        [
            {
                "code": "fsc_press",
                "name": "금융위원회 보도자료",
                "allowed_host": "www.fsc.go.kr",
                "allowed_path_prefix": "/no010101/",
                "feed_url": "https://www.fsc.go.kr/about/fsc_bbs_rss/?fid=0111",
                "listing_url": "https://www.fsc.go.kr/no010101",
                "rights_url": "https://www.fsc.go.kr/ut020104",
                "rights_checked_on": date(2026, 10, 29),
                "usage_status": "summary_allowed",
                "summary_allowed": True,
                "active": True,
            },
            {
                "code": "bok_press",
                "name": "한국은행 보도자료",
                "allowed_host": "www.bok.or.kr",
                "allowed_path_prefix": "/portal/",
                "feed_url": "https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690",
                "listing_url": "https://www.bok.or.kr/portal/bbs/B0000552/list.do?menuNo=200690",
                "rights_url": "https://www.bok.or.kr/portal/main/contents.do?menuNo=200228",
                "rights_checked_on": date(2026, 10, 29),
                "usage_status": "discovery_only",
                "summary_allowed": False,
                "active": True,
            },
            {
                "code": "bok_terms",
                "name": "한국은행 경제금융용어 자료",
                "allowed_host": "www.bok.or.kr",
                "allowed_path_prefix": "/portal/",
                "feed_url": None,
                "listing_url": "https://www.bok.or.kr/portal/main/contents.do?menuNo=200191",
                "rights_url": "https://www.bok.or.kr/portal/main/contents.do?menuNo=200228",
                "rights_checked_on": date(2026, 10, 29),
                "usage_status": "candidate_only",
                "summary_allowed": False,
                "active": True,
            },
        ],
    )


def downgrade() -> None:
    op.drop_index(op.f("ix_daily_term_assignments_briefing_date"), table_name="daily_term_assignments")
    op.drop_table("daily_term_assignments")
    op.drop_index(op.f("ix_financial_terms_slug"), table_name="financial_terms")
    op.drop_index(op.f("ix_financial_terms_is_reviewed"), table_name="financial_terms")
    op.drop_table("financial_terms")
    op.drop_index(op.f("ix_daily_briefing_items_status"), table_name="daily_briefing_items")
    op.drop_index(op.f("ix_daily_briefing_items_source_id"), table_name="daily_briefing_items")
    op.drop_index(op.f("ix_daily_briefing_items_published_at"), table_name="daily_briefing_items")
    op.drop_table("daily_briefing_items")
    op.drop_index(op.f("ix_daily_briefing_sources_code"), table_name="daily_briefing_sources")
    op.drop_table("daily_briefing_sources")

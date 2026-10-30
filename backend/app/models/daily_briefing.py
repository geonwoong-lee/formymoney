from datetime import date, datetime

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class DailyBriefingSource(Base):
    __tablename__ = "daily_briefing_sources"
    __table_args__ = (
        CheckConstraint(
            "usage_status IN ('summary_allowed', 'discovery_only', 'candidate_only')",
            name="ck_daily_briefing_source_usage_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120))
    allowed_host: Mapped[str] = mapped_column(String(255))
    allowed_path_prefix: Mapped[str] = mapped_column(String(255))
    feed_url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    listing_url: Mapped[str] = mapped_column(String(500))
    rights_url: Mapped[str] = mapped_column(String(500))
    rights_checked_on: Mapped[date] = mapped_column(Date)
    usage_status: Mapped[str] = mapped_column(String(30))
    summary_allowed: Mapped[bool] = mapped_column(Boolean, default=False)
    active: Mapped[bool] = mapped_column(Boolean, default=True)

    items: Mapped[list["DailyBriefingItem"]] = relationship(back_populates="source")


class DailyBriefingItem(Base):
    __tablename__ = "daily_briefing_items"
    __table_args__ = (
        CheckConstraint(
            "status IN ('draft', 'validated', 'published', 'rejected')",
            name="ck_daily_briefing_item_status",
        ),
        UniqueConstraint("source_id", "source_item_id", name="uq_daily_briefing_source_item"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    source_id: Mapped[int] = mapped_column(ForeignKey("daily_briefing_sources.id"), index=True)
    source_item_id: Mapped[str] = mapped_column(String(255))
    canonical_url: Mapped[str] = mapped_column(String(1000), unique=True)
    original_title: Mapped[str] = mapped_column(String(500))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    content_sha256: Mapped[str] = mapped_column(String(64), unique=True)
    status: Mapped[str] = mapped_column(String(20), index=True)
    validation_errors: Mapped[list[str]] = mapped_column(JSON, default=list)
    plain_headline: Mapped[str] = mapped_column(String(500))
    summary_points: Mapped[list[dict[str, object]]] = mapped_column(JSON)
    why_it_matters: Mapped[dict[str, object]] = mapped_column(JSON)
    related_terms: Mapped[list[str]] = mapped_column(JSON, default=list)
    caution: Mapped[str] = mapped_column(Text)
    schema_version: Mapped[str] = mapped_column(String(20))
    model_name: Mapped[str] = mapped_column(String(120))
    prompt_version: Mapped[str] = mapped_column(String(50))
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    input_tokens: Mapped[int] = mapped_column(Integer)
    output_tokens: Mapped[int] = mapped_column(Integer)

    source: Mapped[DailyBriefingSource] = relationship(back_populates="items")


class FinancialTerm(Base):
    __tablename__ = "financial_terms"

    id: Mapped[int] = mapped_column(primary_key=True)
    slug: Mapped[str] = mapped_column(String(100), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(120), unique=True)
    short_definition: Mapped[str] = mapped_column(Text)
    example: Mapped[str] = mapped_column(Text)
    source_name: Mapped[str] = mapped_column(String(120))
    source_url: Mapped[str] = mapped_column(String(500))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    is_reviewed: Mapped[bool] = mapped_column(Boolean, default=False, index=True)

    assignments: Mapped[list["DailyTermAssignment"]] = relationship(back_populates="term")


class DailyTermAssignment(Base):
    __tablename__ = "daily_term_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    briefing_date: Mapped[date] = mapped_column(Date, unique=True, index=True)
    term_id: Mapped[int] = mapped_column(ForeignKey("financial_terms.id"))

    term: Mapped[FinancialTerm] = relationship(back_populates="assignments")


class NewsHeadline(Base):
    """Title-and-link only headline from a news search API; rows expire after a retention window."""

    __tablename__ = "news_headlines"
    __table_args__ = (
        CheckConstraint("region IN ('domestic', 'international')", name="ck_news_headline_region"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    provider: Mapped[str] = mapped_column(String(30))
    region: Mapped[str] = mapped_column(String(20), index=True)
    topic: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(500))
    publisher: Mapped[str] = mapped_column(String(255))
    url: Mapped[str] = mapped_column(String(1000), unique=True)
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), index=True)
    title_ko: Mapped[str | None] = mapped_column(String(500), nullable=True)
    summary_ko: Mapped[str | None] = mapped_column(Text, nullable=True)
    ai_model: Mapped[str | None] = mapped_column(String(120), nullable=True)

from datetime import date

from sqlalchemy import Boolean, Date, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class YouthPolicy(Base):
    """One 온통청년 youth policy as the API last listed it; the whole table is replaced on each collection."""

    __tablename__ = "youth_policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    policy_no: Mapped[str] = mapped_column(String(30), unique=True)
    name: Mapped[str] = mapped_column(String(200))
    keywords: Mapped[str] = mapped_column(String(300))
    summary: Mapped[str] = mapped_column(Text)
    support: Mapped[str] = mapped_column(Text)
    category: Mapped[str] = mapped_column(String(100), index=True)
    subcategory: Mapped[str] = mapped_column(String(150))
    min_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    income_note: Mapped[str] = mapped_column(Text)
    extra_conditions: Mapped[str] = mapped_column(Text)
    apply_start: Mapped[date | None] = mapped_column(Date, nullable=True)
    apply_end: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    apply_method: Mapped[str] = mapped_column(Text)
    selection: Mapped[str] = mapped_column(Text)
    institution: Mapped[str] = mapped_column(String(200))
    apply_url: Mapped[str] = mapped_column(Text)
    ref_url: Mapped[str] = mapped_column(Text)
    regions: Mapped[str] = mapped_column(String(80))
    nationwide: Mapped[bool] = mapped_column(Boolean)
    modified_on: Mapped[date | None] = mapped_column(Date, nullable=True)
    updated_on: Mapped[date] = mapped_column(Date, index=True)

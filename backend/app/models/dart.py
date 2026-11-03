from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class BankFinancial(Base):
    """A compared bank's main accounts from its latest DART business report (one row per bank, replaced on refresh)."""

    __tablename__ = "bank_financials"

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_code: Mapped[str] = mapped_column(String(30), unique=True)
    corp_code: Mapped[str] = mapped_column(String(8))
    corp_name: Mapped[str] = mapped_column(String(100))
    year: Mapped[int] = mapped_column(Integer)
    fs_div: Mapped[str] = mapped_column(String(3))
    period_end: Mapped[str] = mapped_column(String(20))
    receipt_no: Mapped[str] = mapped_column(String(20))
    current: Mapped[dict[str, str]] = mapped_column(JSON)
    previous: Mapped[dict[str, str]] = mapped_column(JSON)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class DartFiling(Base):
    """A filing by a compared bank or its holding company: title, date and DART link only."""

    __tablename__ = "dart_filings"

    id: Mapped[int] = mapped_column(primary_key=True)
    receipt_no: Mapped[str] = mapped_column(String(20), unique=True)
    corp_code: Mapped[str] = mapped_column(String(8), index=True)
    corp_name: Mapped[str] = mapped_column(String(100))
    title: Mapped[str] = mapped_column(String(300))
    filed_on: Mapped[date] = mapped_column(Date, index=True)
    filer: Mapped[str] = mapped_column(String(100))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

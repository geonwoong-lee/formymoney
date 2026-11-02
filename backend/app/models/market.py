from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class MarketPoint(Base):
    """One value of a Bank of Korea ECOS series; period is YYYYMMDD for daily and YYYYMM for monthly series."""

    __tablename__ = "market_points"
    __table_args__ = (UniqueConstraint("series_code", "period", name="uq_market_points_series_period"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    series_code: Mapped[str] = mapped_column(String(40), index=True)
    period: Mapped[str] = mapped_column(String(8))
    value: Mapped[Decimal] = mapped_column(Numeric(18, 4))
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

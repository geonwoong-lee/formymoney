from datetime import date

from sqlalchemy import Date, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class AnalyticsDailyCount(Base):
    """How many times a screen or step was used on a day, from users who agreed to anonymous statistics.

    Only the day, the event name and a count are kept: no user, session, device or IP.
    """

    __tablename__ = "analytics_daily_counts"
    __table_args__ = (UniqueConstraint("day", "event", name="uq_analytics_daily_counts_day_event"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    event: Mapped[str] = mapped_column(String(40))
    count: Mapped[int] = mapped_column(Integer, default=0)

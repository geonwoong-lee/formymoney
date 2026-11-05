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


class ConditionAnswerDailyCount(Base):
    """How many times visitors who agreed to anonymous statistics answered a bank's preferential condition yes, no or unknown on a day.

    Only the day, bank, condition, answer and a count are kept: no user, session, device or IP, and nothing that links
    one answer to another answer from the same person.
    """

    __tablename__ = "condition_answer_daily_counts"
    __table_args__ = (UniqueConstraint(
        "day", "bank_code", "condition_code", "answer", name="uq_condition_answer_daily_counts_key"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    bank_code: Mapped[str] = mapped_column(String(30))
    condition_code: Mapped[str] = mapped_column(String(50))
    answer: Mapped[str] = mapped_column(String(10))
    count: Mapped[int] = mapped_column(Integer, default=0)

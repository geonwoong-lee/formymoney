from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class ProductRateSnapshot(Base):
    """One deposit or savings product option (term, rate type) as 금융감독원 disclosed it on a collection day."""

    __tablename__ = "product_rate_snapshots"
    __table_args__ = (UniqueConstraint(
        "day", "kind", "product_code", "company", "term_months", "rate_type", "reserve_type", name="uq_product_rate_snapshot",
    ),)

    id: Mapped[int] = mapped_column(primary_key=True)
    day: Mapped[date] = mapped_column(Date, index=True)
    kind: Mapped[str] = mapped_column(String(10))
    group: Mapped[str] = mapped_column(String(20))
    company: Mapped[str] = mapped_column(String(100))
    product_code: Mapped[str] = mapped_column(String(60))
    product_name: Mapped[str] = mapped_column(String(200))
    term_months: Mapped[int] = mapped_column(Integer)
    rate_type: Mapped[str] = mapped_column(String(20))
    reserve_type: Mapped[str] = mapped_column(String(20))
    base_rate: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    max_rate: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    disclosed_month: Mapped[str] = mapped_column(String(6))

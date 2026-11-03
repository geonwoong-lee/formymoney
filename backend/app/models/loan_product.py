from datetime import date
from decimal import Decimal

from sqlalchemy import Date, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class LoanProduct(Base):
    """One rent deposit loan option (repayment type, rate type) as 금융감독원 last disclosed it; replaced on each collection."""

    __tablename__ = "loan_products"
    __table_args__ = (UniqueConstraint("company", "product_code", "repay_type", "rate_type", name="uq_loan_product"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    group: Mapped[str] = mapped_column(String(20))
    company: Mapped[str] = mapped_column(String(100))
    product_code: Mapped[str] = mapped_column(String(60))
    product_name: Mapped[str] = mapped_column(String(200))
    repay_type: Mapped[str] = mapped_column(String(30))
    rate_type: Mapped[str] = mapped_column(String(20))
    rate_min: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    rate_max: Mapped[Decimal | None] = mapped_column(Numeric(6, 2), nullable=True)
    loan_limit: Mapped[str] = mapped_column(Text)
    early_repay_fee: Mapped[str] = mapped_column(Text)
    delay_rate: Mapped[str] = mapped_column(Text)
    join_way: Mapped[str] = mapped_column(String(200))
    disclosed_month: Mapped[str] = mapped_column(String(6))
    updated_on: Mapped[date] = mapped_column(Date, index=True)

from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class InvestmentAsset(Base):
    __tablename__ = "investment_assets"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    ticker: Mapped[str] = mapped_column(String(20), unique=True)
    name: Mapped[str] = mapped_column(String(120))
    category: Mapped[str] = mapped_column(String(50))
    currency: Mapped[str] = mapped_column(String(3))
    benchmark: Mapped[str] = mapped_column(String(150))
    leveraged: Mapped[bool] = mapped_column(Boolean)
    expense_ratio_percent: Mapped[Decimal] = mapped_column(Numeric(6, 3))
    distribution_policy: Mapped[str] = mapped_column(String(50))
    provider_source_url: Mapped[str] = mapped_column(String(500))
    price_source_url: Mapped[str] = mapped_column(String(500))
    fx_source_url: Mapped[str] = mapped_column(String(500))
    source_date: Mapped[str] = mapped_column(String(10))
    warning: Mapped[str] = mapped_column(Text)

    points: Mapped[list["InvestmentMonthlyPoint"]] = relationship(
        back_populates="asset",
        cascade="all, delete-orphan",
        order_by="InvestmentMonthlyPoint.month",
    )


class InvestmentMonthlyPoint(Base):
    __tablename__ = "investment_monthly_points"
    __table_args__ = (UniqueConstraint("asset_id", "month"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    asset_id: Mapped[int] = mapped_column(ForeignKey("investment_assets.id"))
    month: Mapped[str] = mapped_column(String(7))
    adjusted_close: Mapped[Decimal] = mapped_column(Numeric(18, 6))
    usd_krw: Mapped[Decimal] = mapped_column(Numeric(18, 6))

    asset: Mapped[InvestmentAsset] = relationship(back_populates="points")

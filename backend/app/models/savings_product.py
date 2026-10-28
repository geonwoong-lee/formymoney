from decimal import Decimal

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class SavingsPolicy(Base):
    __tablename__ = "savings_policies"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(50), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(100))
    term_months: Mapped[int] = mapped_column(Integer)
    minimum_monthly_amount: Mapped[int] = mapped_column(Integer)
    maximum_monthly_amount: Mapped[int] = mapped_column(Integer)
    annual_limit: Mapped[int] = mapped_column(Integer)
    general_contribution_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    preferred_contribution_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    tax_exempt: Mapped[bool] = mapped_column(Boolean)
    source_url: Mapped[str] = mapped_column(String(500))
    source_date: Mapped[str] = mapped_column(String(10))


class BankSavingsProduct(Base):
    __tablename__ = "bank_savings_products"

    id: Mapped[int] = mapped_column(primary_key=True)
    bank_code: Mapped[str] = mapped_column(String(30), unique=True, index=True)
    bank_name: Mapped[str] = mapped_column(String(100))
    product_name: Mapped[str] = mapped_column(String(100))
    base_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    maximum_bonus_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    source_url: Mapped[str] = mapped_column(String(500))
    source_date: Mapped[str] = mapped_column(String(10))

    conditions: Mapped[list["PreferentialCondition"]] = relationship(
        back_populates="product",
        cascade="all, delete-orphan",
        order_by="PreferentialCondition.sort_order",
    )


class PreferentialCondition(Base):
    __tablename__ = "preferential_conditions"
    __table_args__ = (UniqueConstraint("product_id", "code"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(ForeignKey("bank_savings_products.id"))
    code: Mapped[str] = mapped_column(String(50))
    title: Mapped[str] = mapped_column(String(100))
    bonus_rate: Mapped[Decimal] = mapped_column(Numeric(5, 2))
    description: Mapped[str] = mapped_column(Text)
    question: Mapped[str] = mapped_column(Text)
    requires_additional_review: Mapped[bool] = mapped_column(Boolean, default=False)
    sort_order: Mapped[int] = mapped_column(Integer)

    product: Mapped[BankSavingsProduct] = relationship(back_populates="conditions")

from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.savings_product import BankSavingsProduct, SavingsPolicy


class SavingsRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_policy(self, code: str = "youth_future_savings") -> SavingsPolicy | None:
        return self.session.scalar(select(SavingsPolicy).where(SavingsPolicy.code == code))

    def list_products(self) -> list[BankSavingsProduct]:
        query = (
            select(BankSavingsProduct)
            .options(selectinload(BankSavingsProduct.conditions))
            .order_by(BankSavingsProduct.bank_code)
        )
        return list(self.session.scalars(query).all())

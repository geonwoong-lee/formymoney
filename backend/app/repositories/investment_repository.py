from sqlalchemy import select
from sqlalchemy.orm import Session, selectinload

from app.models.investment import InvestmentAsset


class InvestmentRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def list_assets(self) -> list[InvestmentAsset]:
        query = select(InvestmentAsset).options(selectinload(InvestmentAsset.points)).order_by(InvestmentAsset.code)
        return list(self.session.scalars(query).all())

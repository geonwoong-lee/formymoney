from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.reference_item import ReferenceItem


class ReferenceRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_by_key(self, key: str) -> ReferenceItem | None:
        return self.session.scalar(select(ReferenceItem).where(ReferenceItem.key == key))

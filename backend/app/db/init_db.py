from sqlalchemy import Engine, select

from app.db.base import Base
from app.models.reference_item import ReferenceItem
from app.db.session import SessionFactory


def initialize_database(engine: Engine, session_factory: SessionFactory) -> None:
    Base.metadata.create_all(engine)

    with session_factory() as session:
        existing = session.scalar(select(ReferenceItem).where(ReferenceItem.key == "phase1-ready"))
        if existing is None:
            session.add(
                ReferenceItem(
                    key="phase1-ready",
                    label="Phase 1 SQLite connection",
                )
            )
            session.commit()

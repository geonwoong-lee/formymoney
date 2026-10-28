from sqlalchemy.orm import Session

from app.repositories.reference_repository import ReferenceRepository


class HealthService:
    def __init__(self, session: Session) -> None:
        self.repository = ReferenceRepository(session)

    def get_reference_key(self) -> str:
        item = self.repository.get_by_key("phase1-ready")
        if item is None:
            raise RuntimeError("SQLite reference data is missing.")
        return item.key

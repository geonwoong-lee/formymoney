from datetime import datetime

from sqlalchemy import JSON, DateTime, String
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base


class SavedWatchlist(Base):
    """The products a signed-in user starred and chose to keep on their account; one row per user, kept only on request."""

    __tablename__ = "saved_watchlists"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[str] = mapped_column(String(64), unique=True)
    items: Mapped[list[dict[str, str]]] = mapped_column(JSON)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

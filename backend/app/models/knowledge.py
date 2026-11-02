from datetime import date, datetime

from sqlalchemy import JSON, Date, DateTime, String, Text
from sqlalchemy.engine import Dialect
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.types import TypeDecorator, TypeEngine, UserDefinedType

from app.db.base import Base
from app.services.openai_client import EMBEDDING_DIMENSIONS


class PgVector(UserDefinedType):
    """pgvector's vector type; values travel as its text form '[0.1,0.2,...]'."""

    cache_ok = True

    def get_col_spec(self, **_: object) -> str:
        return f"vector({EMBEDDING_DIMENSIONS})"


class Embedding(TypeDecorator):
    """A vector column on PostgreSQL (searched with pgvector) and plain JSON elsewhere (tests)."""

    impl = JSON
    cache_ok = True

    def load_dialect_impl(self, dialect: Dialect) -> TypeEngine:
        return dialect.type_descriptor(PgVector() if dialect.name == "postgresql" else JSON())

    def process_bind_param(self, value: list[float] | None, dialect: Dialect) -> object:
        if value is None or dialect.name != "postgresql":
            return value
        return "[" + ",".join(repr(float(number)) for number in value) + "]"

    def process_result_value(self, value: object, dialect: Dialect) -> list[float] | None:
        if isinstance(value, str):
            return [float(number) for number in value.strip("[]").split(",") if number]
        return value  # type: ignore[return-value]


class KnowledgeChunk(Base):
    """One searchable piece of what 머니독 may answer from: site guide, term, digest, money note or market value."""

    __tablename__ = "knowledge_chunks"

    id: Mapped[int] = mapped_column(primary_key=True)
    source_key: Mapped[str] = mapped_column(String(200), unique=True)
    source_type: Mapped[str] = mapped_column(String(20), index=True)
    title: Mapped[str] = mapped_column(String(300))
    content: Mapped[str] = mapped_column(Text)
    url: Mapped[str | None] = mapped_column(String(500), nullable=True)
    published_on: Mapped[date | None] = mapped_column(Date, nullable=True, index=True)
    content_sha256: Mapped[str] = mapped_column(String(64))
    embedding: Mapped[list[float] | None] = mapped_column(Embedding(), nullable=True)
    embedding_model: Mapped[str | None] = mapped_column(String(80), nullable=True)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

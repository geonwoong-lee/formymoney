from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session, sessionmaker


SessionFactory = sessionmaker[Session]


class DatabaseConfigurationError(RuntimeError):
    pass


class DatabaseConnectionError(RuntimeError):
    pass


def normalize_database_url(database_url: str) -> str:
    if database_url.startswith("postgres://"):
        return database_url.replace("postgres://", "postgresql+psycopg://", 1)
    if database_url.startswith("postgresql://"):
        return database_url.replace("postgresql://", "postgresql+psycopg://", 1)
    return database_url


def require_postgres_url(database_url: str | None) -> str:
    if not database_url or not database_url.strip():
        raise DatabaseConfigurationError(
            "VERY_RICH_DATABASE_URL이 없습니다. backend/.env의 Session pooler 연결 정보를 확인해 주세요."
        )
    normalized = normalize_database_url(database_url.strip())
    if not normalized.startswith("postgresql+psycopg://"):
        raise DatabaseConfigurationError(
            "VERY_RICH_DATABASE_URL은 Supabase PostgreSQL Session pooler 연결 문자열이어야 합니다."
        )
    return normalized


def create_database_engine(database_url: str) -> Engine:
    database_url = normalize_database_url(database_url)
    connect_args: dict[str, object] = {}

    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        _create_sqlite_parent(database_url)

    engine_options: dict[str, object] = {"pool_pre_ping": True}
    if database_url.startswith("postgresql+psycopg://"):
        engine_options.update({"pool_size": 5, "max_overflow": 5})

    return create_engine(database_url, connect_args=connect_args, **engine_options)


def verify_database_connection(engine: Engine) -> None:
    try:
        with engine.connect() as connection:
            connection.exec_driver_sql("SELECT 1")
    except SQLAlchemyError:
        raise DatabaseConnectionError(
            "PostgreSQL에 연결하지 못했습니다. Session pooler 호스트·포트·사용자명·비밀번호와 sslmode를 확인해 주세요."
        ) from None


def create_session_factory(engine: Engine) -> SessionFactory:
    return sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def _create_sqlite_parent(database_url: str) -> None:
    if database_url in {"sqlite://", "sqlite:///:memory:"}:
        return

    prefix = "sqlite:///"
    if not database_url.startswith(prefix):
        return

    database_path = Path(database_url.removeprefix(prefix))
    database_path.parent.mkdir(parents=True, exist_ok=True)

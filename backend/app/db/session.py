from pathlib import Path

from sqlalchemy import Engine, create_engine
from sqlalchemy.orm import Session, sessionmaker


SessionFactory = sessionmaker[Session]


def create_database_engine(database_url: str) -> Engine:
    connect_args: dict[str, object] = {}

    if database_url.startswith("sqlite"):
        connect_args["check_same_thread"] = False
        _create_sqlite_parent(database_url)

    return create_engine(database_url, connect_args=connect_args)


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

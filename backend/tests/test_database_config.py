from pathlib import Path

import pytest
from alembic.config import Config
from alembic.script import ScriptDirectory
from fastapi.testclient import TestClient

from app.db.session import DatabaseConfigurationError, normalize_database_url, require_postgres_url
from app.main import create_app
from app.core.config import Settings


def test_postgres_urls_use_psycopg_driver() -> None:
    assert normalize_database_url("postgresql://user:password@host:5432/postgres") == (
        "postgresql+psycopg://user:password@host:5432/postgres"
    )


@pytest.mark.parametrize("database_url", [None, "", "sqlite:///local.sqlite3"])
def test_runtime_never_falls_back_to_sqlite(database_url: str | None) -> None:
    with pytest.raises(DatabaseConfigurationError):
        require_postgres_url(database_url)


def test_server_without_database_url_stops_with_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("VERY_RICH_DATABASE_URL", raising=False)
    monkeypatch.setattr("app.main.get_settings", lambda: Settings(_env_file=None))
    app = create_app()

    with pytest.raises(DatabaseConfigurationError, match="VERY_RICH_DATABASE_URL"):
        with TestClient(app):
            pass


def test_alembic_has_single_initial_head() -> None:
    backend_dir = Path(__file__).resolve().parents[1]
    config = Config(backend_dir / "alembic.ini")
    script = ScriptDirectory.from_config(config)

    assert script.get_heads() == ["20261028_0001"]

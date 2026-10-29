from collections.abc import Iterator
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.main import create_app


@pytest.fixture
def client(tmp_path: Path) -> Iterator[TestClient]:
    database_url = f"sqlite:///{(tmp_path / 'test.sqlite3').as_posix()}"
    app = create_app(
        database_url=database_url,
        create_schema_for_tests=True,
        n8n_ingest_secret="test-ingest-secret",
    )
    with TestClient(app) as test_client:
        yield test_client

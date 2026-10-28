from fastapi.testclient import TestClient
from sqlalchemy import inspect


def test_health_reads_seeded_sqlite_reference(client: TestClient) -> None:
    response = client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "app": "Very Rich?",
        "database": "ok",
        "referenceKey": "phase1-ready",
    }


def test_database_contains_public_reference_table(client: TestClient) -> None:
    table_names = inspect(client.app.state.engine).get_table_names()

    assert "reference_items" in table_names


def test_development_frontend_origin_is_allowed(client: TestClient) -> None:
    response = client.options(
        "/api/v1/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"

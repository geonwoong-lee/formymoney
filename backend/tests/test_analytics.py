from datetime import date

from fastapi.testclient import TestClient

from app.api.v1.endpoints import analytics as analytics_endpoint
from app.models.analytics import AnalyticsDailyCount
from app.services.analytics_service import AnalyticsService

HEADERS = {"X-Very-Rich-Ingest-Secret": "test-ingest-secret"}


def test_events_are_counted_per_day_without_anything_identifying(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(analytics_endpoint, "korea_today", lambda: date(2026, 11, 2))
    for event in ["visit_conditions", "visit_conditions", "visit_banks", "plan_maturity"]:
        assert client.post("/api/v1/analytics/events", json={"event": event}).status_code == 204
    assert client.post("/api/v1/analytics/events", json={"event": "who_are_you"}).status_code == 422
    assert client.post("/api/v1/analytics/events", json={"event": "visit_banks", "userId": "x"}).status_code == 204

    with client.app.state.session_factory() as session:
        rows = {(row.day, row.event): row.count for row in session.query(AnalyticsDailyCount)}
    assert rows == {
        (date(2026, 11, 2), "visit_conditions"): 2, (date(2026, 11, 2), "visit_banks"): 2, (date(2026, 11, 2), "plan_maturity"): 1,
    }
    assert {column.name for column in AnalyticsDailyCount.__table__.columns} == {"id", "day", "event", "count"}


def test_funnel_needs_the_internal_secret_and_reads_totals_over_the_period(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(analytics_endpoint, "korea_today", lambda: date(2026, 11, 2))
    with client.app.state.session_factory() as session:
        service = AnalyticsService(session)
        for _ in range(4):
            service.record("visit_conditions", date(2026, 11, 2))
        service.record("visit_banks", date(2026, 11, 1))
        service.record("visit_conditions", date(2026, 9, 1))  # outside a 30-day window

    assert client.get("/api/v1/internal/analytics/funnel").status_code == 401
    body = client.get("/api/v1/internal/analytics/funnel", params={"days": 30}, headers=HEADERS).json()

    steps = {step["event"]: step for step in body["steps"]}
    assert (body["start"], body["end"]) == ("2026-10-04", "2026-11-02")
    assert steps["visit_conditions"]["count"] == 4 and steps["visit_conditions"]["ofFirstStepPercent"] == 100.0
    assert steps["visit_banks"]["ofFirstStepPercent"] == 25.0
    assert steps["visit_daily"]["inFunnel"] is False and steps["visit_daily"]["ofFirstStepPercent"] is None


def test_event_posts_are_rate_limited(client: TestClient) -> None:
    codes = [client.post("/api/v1/analytics/events", json={"event": "visit_daily"}).status_code for _ in range(61)]
    assert codes[:60] == [204] * 60 and codes[60] == 429

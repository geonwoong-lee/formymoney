from datetime import date, datetime, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.collectors.ecos import EcosError
from app.collectors.naver_news import Headline, NaverNewsError
from app.core.config import Settings
from app.services import daily_jobs
from app.services.daily_jobs import EXIT_CODES, JobResult, run_market_job, run_news_job

JOB_URL = "/api/v1/internal/daily/jobs"
STATUS_URL = "/api/v1/internal/daily/runs/status"
HEADERS = {"X-Very-Rich-Ingest-Secret": "test-ingest-secret"}


def _settings(**values: object) -> Settings:
    return Settings(_env_file=None, **values)


def test_job_status_follows_failures() -> None:
    assert JobResult("x", attempted=3).status == "success"
    partial = JobResult("x", attempted=3)
    partial.fail("a", "오류")
    assert partial.status == "partial"
    failed = JobResult("x", attempted=1)
    failed.fail("a", "오류")
    assert failed.status == "failed"
    assert EXIT_CODES == {"success": 0, "partial": 2, "failed": 1}


def test_market_job_reports_partial_failed_and_missing_key(client: TestClient) -> None:
    def fetch_some(api_key, series, today):
        if series.code == "kospi":
            raise EcosError("ECOS에 연결하지 못했습니다.")
        return [("20261030", Decimal("1"))]

    with client.app.state.session_factory() as session:
        settings = _settings(ecos_api_key="test-key")
        assert run_market_job(settings, session, lambda *_: [("20261030", Decimal("1"))]).status == "success"
        partial = run_market_job(settings, session, fetch_some)
        assert partial.status == "partial" and partial.failures == ["ECOS:kospi: ECOS에 연결하지 못했습니다."]
        assert run_market_job(settings, session, lambda *_: (_ for _ in ()).throw(EcosError("x"))).status == "failed"
        missing = run_market_job(_settings(), session)
        assert missing.status == "failed" and "VERY_RICH_ECOS_API_KEY" in missing.failures[0]


def test_news_job_saves_headlines_and_skips_ai_without_key(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    now = datetime.now(timezone.utc)

    def fake_headlines(settings, topic):
        if topic == "적금":
            raise NaverNewsError("네이버 뉴스 API 응답 오류(HTTP 500)")
        return [Headline(f"{topic} 소식", "a.co.kr", f"https://a.co.kr/{len(topic)}", now, "요약문")]

    monkeypatch.setattr(daily_jobs, "fetch_headlines", fake_headlines)
    monkeypatch.setattr(daily_jobs, "fetch_feed", lambda feed: [])
    with client.app.state.session_factory() as session:
        result = run_news_job(_settings(), session)

    assert result.status == "partial"
    assert result.failures[0] == "네이버:적금: 네이버 뉴스 API 응답 오류(HTTP 500)"
    assert result.saved >= 1


def test_news_job_without_openai_key_is_partial_even_when_collection_succeeds(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    now = datetime.now(timezone.utc)
    monkeypatch.setattr(daily_jobs, "fetch_headlines", lambda settings, topic: [Headline(topic, "a.co.kr", f"https://a.co.kr/{topic}", now)])
    monkeypatch.setattr(daily_jobs, "fetch_feed", lambda feed: [])
    with client.app.state.session_factory() as session:
        result = run_news_job(_settings(), session)

    assert result.status == "partial"
    assert result.failures == ["경제 뉴스 요약: VERY_RICH_OPENAI_API_KEY가 없어 해외 해석과 요약을 만들지 않았습니다."]


def test_job_endpoint_requires_secret_and_known_job(client: TestClient) -> None:
    assert client.post(f"{JOB_URL}/market").status_code == 401
    assert client.post(f"{JOB_URL}/unknown", headers=HEADERS).status_code == 404


def test_job_endpoint_runs_job_and_records_the_run(client: TestClient) -> None:
    def fake_market(settings, session):
        result = JobResult("market", attempted=2, collected=5, saved=3)
        result.fail("ECOS:kospi", "api_key=abcdef123456 응답 오류")
        return result

    client.app.state.daily_jobs = {"market": fake_market}

    body = client.post(f"{JOB_URL}/market", headers=HEADERS, json={"runId": "n8n-41"}).json()

    assert (body["job"], body["status"], body["collected"], body["saved"]) == ("market", "partial", 5, 3)
    assert body["runRecorded"] is True
    assert "abcdef123456" not in body["failures"][0] and "[가려짐]" in body["failures"][0]
    status = client.get(STATUS_URL, headers=HEADERS).json()
    assert status["latestStatus"] == "partial"
    latest = status["recent"][0]
    assert (latest["workflow"], latest["stage"], latest["candidates"], latest["published"]) == ("daily-market", "ECOS", 5, 3)


def test_job_endpoint_works_without_body_and_records_success(client: TestClient) -> None:
    client.app.state.daily_jobs = {"news": lambda settings, session: JobResult("news", attempted=8, collected=40, saved=12)}

    body = client.post(f"{JOB_URL}/news", headers=HEADERS).json()

    assert body["status"] == "success" and body["runRecorded"] is True
    assert client.get(STATUS_URL, headers=HEADERS).json()["lastSuccess"]["workflow"] == "daily-news"




def test_same_run_id_returns_recorded_result_without_running_again(client: TestClient) -> None:
    calls: list[str] = []

    def fake_news(settings, session):
        calls.append("run")
        return JobResult("news", attempted=8, collected=40, saved=12)

    client.app.state.daily_jobs = {"news": fake_news}

    first = client.post(f"{JOB_URL}/news", headers=HEADERS, json={"runId": "n8n-7"}).json()
    second = client.post(f"{JOB_URL}/news", headers=HEADERS, json={"runId": "n8n-7"}).json()

    assert calls == ["run"]
    assert first["runRecorded"] and second["runRecorded"]
    assert (second["status"], second["collected"], second["saved"]) == ("success", 40, 12)
    assert "다시 수집하지 않았습니다" in second["notes"][0]
    assert len(client.get(STATUS_URL, headers=HEADERS).json()["recent"]) == 1


def test_failed_run_recording_is_reported(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    from sqlalchemy.exc import OperationalError

    from app.services.collection_run_service import CollectionRunService

    def broken_record(self, payload):
        raise OperationalError("insert", {}, Exception("db down"))

    monkeypatch.setattr(CollectionRunService, "record", broken_record)
    client.app.state.daily_jobs = {"market": lambda settings, session: JobResult("market", attempted=1, collected=1, saved=1)}

    body = client.post(f"{JOB_URL}/market", headers=HEADERS, json={"runId": "n8n-8"}).json()

    assert body["status"] == "success" and body["runRecorded"] is False


def test_job_endpoint_returns_503_when_run_lookup_fails(client: TestClient) -> None:
    from sqlalchemy.exc import OperationalError

    def broken_session():
        raise OperationalError("select", {}, Exception("db down"))

    calls: list[str] = []
    client.app.state.daily_jobs = {"news": lambda settings, session: calls.append("run") or JobResult("news")}
    client.app.state.session_factory = broken_session

    response = client.post(f"{JOB_URL}/news", headers=HEADERS, json={"runId": "n8n-9"})

    assert response.status_code == 503
    assert calls == []

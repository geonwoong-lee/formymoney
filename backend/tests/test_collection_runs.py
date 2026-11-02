from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.services.collection_run_service import sanitize_error_message


RUNS_URL = "/api/v1/internal/daily/runs"
STATUS_URL = "/api/v1/internal/daily/runs/status"
HEADERS = {"X-Very-Rich-Ingest-Secret": "test-ingest-secret"}


def _run(**changes: object) -> dict[str, object]:
    now = datetime.now(timezone.utc)
    payload: dict[str, object] = {
        "workflow": "daily-official-news",
        "status": "success",
        "candidates": 3,
        "published": 2,
        "rejected": 1,
        "inputTokens": 1_000,
        "outputTokens": 200,
        "startedAt": now.isoformat(),
        "finishedAt": now.isoformat(),
    }
    payload.update(changes)
    return payload


def test_run_endpoints_require_secret(client: TestClient) -> None:
    assert client.post(RUNS_URL, json=_run()).status_code == 401
    assert client.get(STATUS_URL).status_code == 401
    assert client.get(STATUS_URL, headers={"X-Very-Rich-Ingest-Secret": "wrong"}).status_code == 401


def test_status_without_runs_is_empty_not_healthy(client: TestClient) -> None:
    body = client.get(STATUS_URL, headers=HEADERS).json()

    assert body["latestStatus"] is None
    assert body["lastSuccess"] is None
    assert body["recent"] == []
    assert body["todayTokens"] == 0


def test_status_reports_last_success_and_failure_cause(client: TestClient) -> None:
    client.post(RUNS_URL, json=_run(), headers=HEADERS)
    client.post(
        RUNS_URL,
        json=_run(status="failed", stage="OpenAI Structured Output", errorMessage="OpenAI 429 한도 초과", published=0),
        headers=HEADERS,
    )

    body = client.get(STATUS_URL, headers=HEADERS).json()

    assert body["latestStatus"] == "failed"
    assert body["lastSuccess"]["published"] == 2
    assert body["lastFailure"]["stage"] == "OpenAI Structured Output"
    assert body["lastFailure"]["errorMessage"] == "OpenAI 429 한도 초과"
    assert len(body["recent"]) == 2


def test_failed_run_does_not_look_like_a_normal_briefing(client: TestClient) -> None:
    client.post(RUNS_URL, json=_run(status="failed", published=0, errorMessage="RSS 연결 실패"), headers=HEADERS)

    status = client.get(STATUS_URL, headers=HEADERS).json()
    daily = client.get("/api/v1/daily").json()

    assert status["latestStatus"] == "failed"
    assert status["lastSuccess"] is None
    assert daily["items"] == []


def test_token_usage_alert_turns_on_over_daily_limit(client: TestClient) -> None:
    client.app.state.settings = client.app.state.settings.model_copy(update={"daily_token_limit": 1_000})
    client.post(RUNS_URL, json=_run(inputTokens=600, outputTokens=100), headers=HEADERS)
    assert client.get(STATUS_URL, headers=HEADERS).json()["tokenLimitExceeded"] is False

    client.post(RUNS_URL, json=_run(inputTokens=300, outputTokens=100), headers=HEADERS)
    body = client.get(STATUS_URL, headers=HEADERS).json()

    assert body["todayTokens"] == 1_100
    assert body["dailyTokenLimit"] == 1_000
    assert body["tokenLimitExceeded"] is True


def test_yesterdays_tokens_do_not_count_today(client: TestClient) -> None:
    old = datetime(2026, 1, 1, tzinfo=timezone.utc).isoformat()
    client.post(RUNS_URL, json=_run(startedAt=old, finishedAt=old, inputTokens=5_000), headers=HEADERS)

    assert client.get(STATUS_URL, headers=HEADERS).json()["todayTokens"] == 0


def test_secret_like_text_is_masked_in_stored_error() -> None:
    message = (
        "401 sk-abcdefghijklmnop Bearer abc.def api_key=hunter2 "
        "postgresql://user:pw123@host:5432/db"
    )

    cleaned = sanitize_error_message(message)

    assert cleaned is not None
    for leaked in ("sk-abcdefghijklmnop", "abc.def", "hunter2", "pw123"):
        assert leaked not in cleaned
    assert len(sanitize_error_message("가" * 1_000) or "") == 300


def test_stored_error_is_masked_through_api(client: TestClient) -> None:
    response = client.post(
        RUNS_URL,
        json=_run(status="failed", errorMessage="auth failed sk-abcdefghijklmnop"),
        headers=HEADERS,
    )

    assert "sk-abcdefghijklmnop" not in response.text
    assert "sk-abcdefghijklmnop" not in client.get(STATUS_URL, headers=HEADERS).text


def test_invalid_status_is_rejected(client: TestClient) -> None:
    assert client.post(RUNS_URL, json=_run(status="ok"), headers=HEADERS).status_code == 422


def test_json_shaped_secrets_are_masked() -> None:
    message = '{"apiKey":"abc123xyz","password": "pw-value","client_secret":"s3cr3t","access_token":"tok999"}'

    cleaned = sanitize_error_message(message) or ""

    for leaked in ("abc123xyz", "pw-value", "s3cr3t", "tok999"):
        assert leaked not in cleaned


def test_same_run_id_is_recorded_once(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    fixed = {
        "startedAt": (now - timedelta(minutes=10)).isoformat(),
        "finishedAt": (now - timedelta(minutes=5)).isoformat(),
    }
    first = client.post(RUNS_URL, json=_run(runId="exec-1", **fixed), headers=HEADERS).json()
    second = client.post(RUNS_URL, json=_run(runId="exec-1", **fixed), headers=HEADERS).json()
    body = client.get(STATUS_URL, headers=HEADERS).json()

    assert first["id"] == second["id"]
    assert len(body["recent"]) == 1
    assert body["todayTokens"] == 1_200


def test_invalid_times_are_rejected(client: TestClient) -> None:
    naive = "2026-10-30T09:00:00"
    aware = "2026-10-30T09:00:00+09:00"
    earlier = "2026-10-30T08:00:00+09:00"
    future = "2999-01-01T00:00:00+00:00"

    for changes in (
        {"startedAt": naive, "finishedAt": aware},
        {"startedAt": aware, "finishedAt": earlier},
        {"startedAt": aware, "finishedAt": future},
    ):
        assert client.post(RUNS_URL, json=_run(**changes), headers=HEADERS).status_code == 422


def test_token_day_boundary_uses_korean_time(client: TestClient) -> None:
    from app.services.collection_run_service import CollectionRunService
    from app.schemas.collection_run import CollectionRunRequest
    from zoneinfo import ZoneInfo

    kst = ZoneInfo("Asia/Seoul")
    with client.app.state.session_factory() as session:
        service = CollectionRunService(session, 1_000)
        before_midnight = datetime(2026, 10, 29, 23, 59, tzinfo=kst)
        after_midnight = datetime(2026, 10, 30, 0, 1, tzinfo=kst)
        for finished, tokens in ((before_midnight, 500), (after_midnight, 70)):
            service.record(
                CollectionRunRequest(
                    workflow="w", status="success", inputTokens=tokens, startedAt=finished, finishedAt=finished
                )
            )
        status = service.status(now=datetime(2026, 10, 30, 12, 0, tzinfo=kst))

    assert status.today_tokens == 70


def test_nested_and_spaced_secrets_are_masked() -> None:
    message = (
        '{"access_token":["list-secret"],"password":{"value":"obj-secret"},"api_key":"has space secret"} '
        "Authorization: Basic dXNlcjpwYXNz"
    )

    cleaned = sanitize_error_message(message) or ""

    for leaked in ("list-secret", "obj-secret", "space secret", "dXNlcjpwYXNz"):
        assert leaked not in cleaned


def test_workflow_and_stage_are_masked(client: TestClient) -> None:
    response = client.post(
        RUNS_URL,
        json=_run(workflow="wf sk-abcdefghijklmnop", stage="token=leaky123"),
        headers=HEADERS,
    )

    assert "sk-abcdefghijklmnop" not in response.text
    assert "leaky123" not in response.text


def test_same_run_id_with_different_content_is_conflict(client: TestClient) -> None:
    times = {"startedAt": "2026-10-30T09:00:00+09:00", "finishedAt": "2026-10-30T09:05:00+09:00"}
    assert client.post(RUNS_URL, json=_run(runId="exec-9", **times), headers=HEADERS).status_code == 200
    other_time = {"startedAt": "2026-10-30T09:00:00+09:00", "finishedAt": "2026-10-30T09:06:00+09:00"}

    conflict = client.post(RUNS_URL, json=_run(runId="exec-9", status="failed", **times), headers=HEADERS)
    time_conflict = client.post(RUNS_URL, json=_run(runId="exec-9", **other_time), headers=HEADERS)

    assert conflict.status_code == 409
    assert time_conflict.status_code == 409
    assert len(client.get(STATUS_URL, headers=HEADERS).json()["recent"]) == 1

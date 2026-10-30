from datetime import date, datetime, timezone

from fastapi.testclient import TestClient
from sqlalchemy import func, inspect, select

from app.models.daily_briefing import (
    DailyBriefingItem,
    DailyTermAssignment,
    FinancialTerm,
)
from app.schemas.daily_briefing import CAUTION_TEXT


INGEST_URL = "/api/v1/internal/daily/briefings"
INGEST_HEADERS = {"X-Very-Rich-Ingest-Secret": "test-ingest-secret"}


def _payload(**changes: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "sourceCode": "fsc_press",
        "sourceItemId": "fsc-2026-001",
        "canonicalUrl": "https://www.fsc.go.kr/no010101/99999?b=2&a=1#fragment",
        "originalTitle": "금융소비자 지원 정책 발표",
        "publishedAt": "2026-10-29T00:00:00+00:00",
        "fetchedAt": "2026-10-29T01:00:00+00:00",
        "contentSha256": "a" * 64,
        "evidence": [
            {"id": "p1", "text": "금융위원회는 지원 대상을 100만 명으로 확대한다고 발표했습니다."},
            {"id": "p2", "text": "새 제도는 금융소비자가 공식 내용을 쉽게 확인하도록 돕습니다."},
        ],
        "summary": {
            "schemaVersion": "1.0",
            "sourceItemId": "fsc-2026-001",
            "plainHeadline": "금융소비자 지원 정책이 발표됐어요",
            "summaryPoints": [
                {"text": "지원 대상이 100만 명으로 확대됩니다.", "evidenceIds": ["p1"]},
            ],
            "whyItMatters": {
                "text": "금융소비자가 공식 내용을 쉽게 확인할 수 있습니다.",
                "evidenceIds": ["p2"],
            },
            "relatedTerms": ["금융소비자"],
            "caution": CAUTION_TEXT,
        },
        "modelName": "phase14-undecided-model",
        "promptVersion": "1.0",
        "generatedAt": "2026-10-29T02:00:00+00:00",
        "inputTokens": 800,
        "outputTokens": 200,
    }
    payload.update(changes)
    return payload


def test_internal_ingest_requires_secret_without_leaking_value(client: TestClient) -> None:
    missing = client.post(INGEST_URL, json=_payload())
    wrong = client.post(
        INGEST_URL,
        json=_payload(),
        headers={"X-Very-Rich-Ingest-Secret": "do-not-print-this"},
    )

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert "do-not-print-this" not in wrong.text


def test_valid_briefing_is_published_and_publicly_readable(client: TestClient) -> None:
    ingested = client.post(INGEST_URL, json=_payload(), headers=INGEST_HEADERS)
    public = client.get("/api/v1/daily", params={"date": "2026-10-29"})

    assert ingested.status_code == 200
    assert ingested.json() == {
        "id": 1,
        "status": "published",
        "duplicate": False,
        "validationErrors": [],
    }
    assert public.status_code == 200
    body = public.json()
    assert body["date"] == "2026-10-29"
    assert len(body["items"]) == 1
    assert body["items"][0]["sourceCode"] == "fsc_press"
    assert body["items"][0]["aiGenerated"] is True
    assert body["items"][0]["canonicalUrl"] == "https://www.fsc.go.kr/no010101/99999?a=1&b=2"
    assert body["term"] is None


def test_midnight_kst_briefing_belongs_to_korean_date(client: TestClient) -> None:
    payload = _payload(
        publishedAt="2026-10-29T00:00:00+09:00",
        fetchedAt="2026-10-29T01:00:00+09:00",
    )
    client.post(INGEST_URL, json=payload, headers=INGEST_HEADERS)

    korean_date = client.get("/api/v1/daily", params={"date": "2026-10-29"})
    previous_date = client.get("/api/v1/daily", params={"date": "2026-10-28"})

    assert len(korean_date.json()["items"]) == 1
    assert previous_date.json()["items"] == []


def test_repeated_ingest_is_idempotent(client: TestClient) -> None:
    first = client.post(INGEST_URL, json=_payload(), headers=INGEST_HEADERS)
    second = client.post(INGEST_URL, json=_payload(), headers=INGEST_HEADERS)
    with client.app.state.session_factory() as session:
        count = session.scalar(select(func.count()).select_from(DailyBriefingItem))

    assert first.json()["duplicate"] is False
    assert second.json()["duplicate"] is True
    assert first.json()["id"] == second.json()["id"]
    assert count == 1


def test_number_without_evidence_is_rejected_and_hidden(client: TestClient) -> None:
    payload = _payload()
    payload["summary"]["summaryPoints"][0]["text"] = "지원 대상이 500만 명으로 확대됩니다."
    response = client.post(INGEST_URL, json=payload, headers=INGEST_HEADERS)
    public = client.get("/api/v1/daily", params={"date": "2026-10-29"})

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert any("500" in message for message in response.json()["validationErrors"])
    assert public.json()["items"] == []


def test_number_must_match_a_complete_evidence_number(client: TestClient) -> None:
    payload = _payload()
    payload["summary"]["summaryPoints"][0]["text"] = "지원 대상이 10만 명으로 확대됩니다."
    response = client.post(INGEST_URL, json=payload, headers=INGEST_HEADERS)

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert any("10" in message for message in response.json()["validationErrors"])


def test_missing_evidence_and_recommendation_are_rejected(client: TestClient) -> None:
    payload = _payload()
    payload["summary"]["whyItMatters"] = {
        "text": "이 상품을 무조건 사야 한다.",
        "evidenceIds": ["p99"],
    }
    response = client.post(INGEST_URL, json=payload, headers=INGEST_HEADERS)

    assert response.json()["status"] == "rejected"
    errors = response.json()["validationErrors"]
    assert any("무조건" in message for message in errors)
    assert any("p99" in message for message in errors)


def test_discovery_only_source_cannot_publish_summary(client: TestClient) -> None:
    payload = _payload(
        sourceCode="bok_press",
        sourceItemId="bok-001",
        canonicalUrl="https://www.bok.or.kr/portal/bbs/B0000552/view.do?nttId=1",
        contentSha256="b" * 64,
    )
    payload["summary"]["sourceItemId"] = "bok-001"
    response = client.post(INGEST_URL, json=payload, headers=INGEST_HEADERS)

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert any("허용되지 않았습니다" in message for message in response.json()["validationErrors"])


def test_only_reviewed_assigned_term_is_public(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        term = FinancialTerm(
            slug="base-rate",
            name="기준금리",
            short_definition="중앙은행이 통화정책의 기준으로 삼는 금리입니다.",
            example="기준금리가 바뀌면 예금과 대출 금리에도 영향을 줄 수 있습니다.",
            source_name="이용 허용 확인용 공식 자료",
            source_url="https://example.go.kr/terms/base-rate",
            reviewed_at=datetime(2026, 10, 29, tzinfo=timezone.utc),
            is_reviewed=True,
        )
        session.add(term)
        session.flush()
        session.add(DailyTermAssignment(briefing_date=date(2026, 10, 29), term_id=term.id))
        session.commit()

    response = client.get("/api/v1/daily", params={"date": "2026-10-29"})

    assert response.status_code == 200
    assert response.json()["term"]["slug"] == "base-rate"


def test_database_does_not_have_raw_article_body_columns(client: TestClient) -> None:
    columns = {column["name"] for column in inspect(client.app.state.engine).get_columns("daily_briefing_items")}

    assert "raw_html" not in columns
    assert "raw_body" not in columns
    assert "evidence" not in columns


def _add_terms(client: TestClient, count: int, reviewed: bool = True) -> None:
    with client.app.state.session_factory() as session:
        for number in range(count):
            session.add(FinancialTerm(
                slug=f"term-{number}",
                name=f"용어{number}",
                short_definition="테스트용 설명입니다.",
                example="테스트용 예시입니다.",
                source_name="이용 허용 확인용 공식 자료",
                source_url=f"https://example.go.kr/terms/{number}",
                reviewed_at=datetime(2026, 10, 29, tzinfo=timezone.utc) if reviewed else None,
                is_reviewed=reviewed,
            ))
        session.commit()


def _term_name(client: TestClient, day: str) -> str | None:
    term = client.get("/api/v1/daily", params={"date": day}).json()["term"]
    return term["name"] if term else None


def test_same_date_always_shows_same_term_without_writing(client: TestClient) -> None:
    _add_terms(client, 30)

    first = _term_name(client, "2026-10-30")
    second = _term_name(client, "2026-10-30")
    with client.app.state.session_factory() as session:
        assignments = session.scalar(select(func.count()).select_from(DailyTermAssignment))

    assert first is not None and first == second
    assert assignments == 0


def test_terms_rotate_through_every_reviewed_term_before_repeating(client: TestClient) -> None:
    _add_terms(client, 30)

    names = [_term_name(client, f"2026-11-{day:02d}") for day in range(1, 31)]

    assert len(set(names)) == 30
    assert _term_name(client, "2026-12-01") == names[0]


def test_unreviewed_or_missing_terms_show_nothing(client: TestClient) -> None:
    assert _term_name(client, "2026-10-30") is None

    _add_terms(client, 5, reviewed=False)

    assert _term_name(client, "2026-10-30") is None


def test_operator_assignment_overrides_rotation(client: TestClient) -> None:
    _add_terms(client, 3)
    with client.app.state.session_factory() as session:
        target = session.scalar(select(FinancialTerm).where(FinancialTerm.slug == "term-2"))
        session.add(DailyTermAssignment(briefing_date=date(2026, 10, 30), term_id=target.id))
        session.commit()

    assert _term_name(client, "2026-10-30") == "용어2"

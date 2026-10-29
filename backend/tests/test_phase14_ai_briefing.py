from datetime import datetime, timezone
import json

from fastapi.testclient import TestClient
from sqlalchemy import func, select

from app.collectors.official_news import CollectedEvidence, _clean_paragraphs
from app.models.daily_briefing import DailyBriefingItem
from app.schemas.daily_briefing import CAUTION_TEXT


HEADERS = {"X-Very-Rich-Ingest-Secret": "test-ingest-secret"}
EVIDENCE_URL = "/api/v1/internal/daily/candidates/evidence"
RESULT_URL = "/api/v1/internal/daily/briefings/openai-result"


def _evidence_payload() -> dict[str, object]:
    return {
        "sourceCode": "fsc_press",
        "sourceItemId": "fsc-phase14-001",
        "originalTitle": "금융소비자 지원 정책 발표",
        "canonicalUrl": "https://www.fsc.go.kr/no010101/99991",
        "publishedAt": "2026-10-29T00:00:00+00:00",
    }


def _summary(point_text: str = "지원 대상이 100만 명으로 확대됩니다.") -> dict[str, object]:
    return {
        "schema_version": "1.0",
        "source_item_id": "fsc-phase14-001",
        "plain_headline": "금융소비자 지원 정책이 발표됐어요",
        "summary_points": [{"text": point_text, "evidence_ids": ["p1"]}],
        "why_it_matters": {
            "text": "금융소비자가 공식 내용을 쉽게 확인할 수 있습니다.",
            "evidence_ids": ["p2"],
        },
        "related_terms": ["금융소비자"],
        "caution": CAUTION_TEXT,
    }


def _openai_response(summary: dict[str, object] | None = None) -> dict[str, object]:
    return {
        "id": "resp_test_phase14",
        "status": "completed",
        "model": "gpt-6-luna",
        "output": [
            {
                "type": "message",
                "content": [
                    {
                        "type": "output_text",
                        "text": json.dumps(summary or _summary(), ensure_ascii=False),
                    }
                ],
            }
        ],
        "usage": {"input_tokens": 420, "output_tokens": 120},
    }


def _result_payload(summary: dict[str, object] | None = None) -> dict[str, object]:
    return {
        **_evidence_payload(),
        "fetchedAt": "2026-10-29T01:00:00+00:00",
        "contentSha256": "c" * 64,
        "evidence": [
            {"id": "p1", "text": "금융위원회는 지원 대상을 100만 명으로 확대한다고 발표했습니다."},
            {"id": "p2", "text": "금융소비자가 공식 내용을 쉽게 확인하도록 돕습니다."},
        ],
        "openaiResponse": _openai_response(summary),
        "promptVersion": "1.0",
    }


def test_fsc_detail_html_is_reduced_to_bounded_evidence_paragraphs() -> None:
    body = """
    <html><body><div class="board-view-wrap"><div class="body"><div class="cont">
      <p>금융위원회는 지원 대상을 100만 명으로 확대한다고 발표했습니다.</p>
      <p>금융소비자가 공식 내용을 쉽게 확인하도록 돕습니다.</p>
    </div></div></div></body></html>
    """.encode()

    paragraphs = _clean_paragraphs(body)

    assert paragraphs == (
        "금융위원회는 지원 대상을 100만 명으로 확대한다고 발표했습니다.",
        "금융소비자가 공식 내용을 쉽게 확인하도록 돕습니다.",
    )


def test_evidence_endpoint_requires_secret_and_returns_only_numbered_text(client: TestClient) -> None:
    def fake_collector(_candidate: object) -> CollectedEvidence:
        return CollectedEvidence(
            fetched_at=datetime(2026, 10, 29, 1, tzinfo=timezone.utc),
            content_sha256="c" * 64,
            paragraphs=("공식 발표의 첫 번째 근거 문단입니다.", "공식 발표의 두 번째 근거 문단입니다."),
        )

    client.app.state.daily_evidence_collector = fake_collector
    unauthorized = client.post(EVIDENCE_URL, json=_evidence_payload())
    response = client.post(EVIDENCE_URL, json=_evidence_payload(), headers=HEADERS)

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    assert response.json()["evidence"] == [
        {"id": "p1", "text": "공식 발표의 첫 번째 근거 문단입니다."},
        {"id": "p2", "text": "공식 발표의 두 번째 근거 문단입니다."},
    ]
    assert "rawHtml" not in response.json()
    assert "rawBody" not in response.json()


def test_completed_structured_output_is_validated_stored_and_published(client: TestClient) -> None:
    response = client.post(RESULT_URL, json=_result_payload(), headers=HEADERS)
    public = client.get("/api/v1/daily", params={"date": "2026-10-29"})
    with client.app.state.session_factory() as session:
        item = session.scalar(select(DailyBriefingItem))

    assert response.status_code == 200
    assert response.json()["status"] == "published"
    assert public.json()["items"][0]["plainHeadline"] == "금융소비자 지원 정책이 발표됐어요"
    assert item is not None
    assert item.model_name == "gpt-6-luna"
    assert item.input_tokens == 420
    assert item.output_tokens == 120


def test_unsupported_number_is_rejected_and_not_public(client: TestClient) -> None:
    response = client.post(
        RESULT_URL,
        json=_result_payload(_summary("지원 대상이 500만 명으로 확대됩니다.")),
        headers=HEADERS,
    )
    public = client.get("/api/v1/daily", params={"date": "2026-10-29"})

    assert response.status_code == 200
    assert response.json()["status"] == "rejected"
    assert public.json()["items"] == []


def test_refusal_incomplete_and_invalid_json_do_not_create_briefings(client: TestClient) -> None:
    refusal = _result_payload()
    refusal["openaiResponse"]["output"][0]["content"] = [{"type": "refusal", "refusal": "cannot comply"}]
    incomplete = _result_payload()
    incomplete["openaiResponse"]["status"] = "incomplete"
    invalid = _result_payload()
    invalid["openaiResponse"]["output"][0]["content"][0]["text"] = "not-json"

    responses = [
        client.post(RESULT_URL, json=payload, headers=HEADERS)
        for payload in (refusal, incomplete, invalid)
    ]
    with client.app.state.session_factory() as session:
        count = session.scalar(select(func.count()).select_from(DailyBriefingItem))

    assert [response.status_code for response in responses] == [422, 422, 422]
    assert count == 0
    assert all("cannot comply" not in response.text for response in responses)

from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.models.daily_briefing import FinancialTerm
from app.services.assistant_chat import build_context, validate_answer
from app.services.rate_limiter import SlidingWindowLimiter

URL = "/api/v1/assistant/chat"


def _ask(answer: str = "월별 납입 계획에서 빠뜨린 달을 반영해 다시 계산해요.", paths=("/cashflow",)):
    calls = []

    def ask(settings, context, message, feedback):
        calls.append({"context": context, "message": message, "feedback": list(feedback)})
        return {"answer": answer, "link_paths": list(paths)}

    ask.calls = calls
    return ask


def test_answer_comes_with_fixed_page_links_only(client: TestClient) -> None:
    client.app.state.assistant_ask = _ask(paths=("/cashflow", "/not-a-page"))

    body = client.post(URL, json={"message": "이번 달 납입을 빠뜨렸어요"}).json()

    assert body["source"] == "ai"
    assert "빠뜨린 달" in body["answer"]
    assert body["links"] == [{"to": "/cashflow", "label": "월별 납입 계획"}]


def test_question_text_and_context_reach_the_model_as_data(client: TestClient) -> None:
    ask = _ask()
    client.app.state.assistant_ask = ask
    with client.app.state.session_factory() as session:
        session.add(FinancialTerm(
            slug="x", name="환율", short_definition="공식", example="다른 나라 돈과 바꿀 때 쓰는 교환 가격표예요.",
            source_name="s", source_url="https://e.kr", is_reviewed=True, reviewed_at=datetime.now(timezone.utc),
        ))
        session.add(FinancialTerm(
            slug="y", name="비공개용어", short_definition="공식", example="공개되면 안 되는 설명",
            source_name="s", source_url="https://e.kr", is_reviewed=False,
        ))
        session.commit()

    client.post(URL, json={"message": "환율이 뭐예요?   "})

    sent = ask.calls[0]
    assert sent["message"] == "환율이 뭐예요?"
    assert "교환 가격표" in sent["context"]
    assert "공개되면 안 되는 설명" not in sent["context"]


def test_answer_with_an_unsupported_number_is_retried_then_replaced(client: TestClient) -> None:
    ask = _ask(answer="금리는 연 7.77%예요.")
    client.app.state.assistant_ask = ask

    body = client.post(URL, json={"message": "금리가 몇 퍼센트예요?"}).json()

    assert len(ask.calls) == 2 and "7.77" in ask.calls[1]["feedback"][0]
    assert body["source"] == "rule"
    assert "7.77" not in body["answer"]


def test_recommendation_questions_never_reach_the_model(client: TestClient) -> None:
    def must_not_run(*args, **kwargs):
        raise AssertionError("model was called")

    client.app.state.assistant_ask = must_not_run

    body = client.post(URL, json={"message": "어떤 적금을 추천해?"}).json()

    assert body["source"] == "rule"
    assert "추천하거나 가입을 권하지 않아요" in body["answer"]


def test_requests_are_rate_limited_per_client(client: TestClient) -> None:
    client.app.state.assistant_ask = _ask()
    client.app.state.assistant_limiter = SlidingWindowLimiter([(60, 2)])

    statuses = [client.post(URL, json={"message": "납입"}).status_code for _ in range(3)]

    assert statuses == [200, 200, 429]
    assert "너무 많아요" in client.post(URL, json={"message": "납입"}).json()["error"]["message"]


def test_missing_key_reports_unavailable_without_leaking_anything(client: TestClient) -> None:
    client.app.state.settings = Settings(_env_file=None)

    response = client.post(URL, json={"message": "납입이 뭐예요"})

    assert response.status_code == 503
    assert "sk-" not in response.text


def test_message_length_is_limited(client: TestClient) -> None:
    client.app.state.assistant_ask = _ask()

    assert client.post(URL, json={"message": "가" * 201}).status_code == 422
    assert client.post(URL, json={"message": ""}).status_code == 422


def test_validate_answer_blocks_certainty_but_allows_uncertainty() -> None:
    assert validate_answer("불확실성이 있어요.", "질문", "참고") == []
    assert validate_answer("무조건 오릅니다.", "질문", "참고") != []
    assert validate_answer("가" * 501, "질문", "참고") != []
    assert validate_answer("36개월 동안 넣어요.", "36개월이 맞나요?", "참고") == []


def test_limiter_expires_old_hits() -> None:
    now = [0.0]
    limiter = SlidingWindowLimiter([(60, 1)], clock=lambda: now[0])

    assert limiter.allow("a") and not limiter.allow("a") and limiter.allow("b")
    now[0] = 61
    assert limiter.allow("a")


def test_context_lists_only_reviewed_terms_with_explanations(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        assert "공개된 용어 설명이 아직 없습니다" in build_context(session)

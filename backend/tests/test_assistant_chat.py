from datetime import datetime, timezone

import pytest
from fastapi.testclient import TestClient

from app.core.config import Settings
from app.models.daily_briefing import FinancialTerm
from app.services.assistant_chat import AnswerSource, build_context, validate_answer, validate_citations
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

    assert len(ask.calls) == 3 and "7.77" in ask.calls[1]["feedback"][0] and "7.77" in ask.calls[2]["feedback"][0]
    assert body["source"] == "unavailable"
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


def test_a_refusal_that_says_it_cannot_recommend_is_not_rejected(client: TestClient) -> None:
    # "추천할 수는 없어요" is what we want the model to say; only real recommendations are blocked.
    ask = _ask(answer="목돈을 어디에 둘지는 성향마다 달라서 특정 상품을 추천할 수는 없어요. 만기 후 계획에서 비교해 보세요.")
    client.app.state.assistant_ask = ask
    body = client.post(URL, json={"message": "적금 만기되면 목돈은 어디에 둬?"}).json()
    assert (body["source"], len(ask.calls)) == ("ai", 1)

    client.app.state.assistant_ask = _ask(answer="이 예금을 추천드려요.")
    assert client.post(URL, json={"message": "적금 만기되면 목돈은 어디에 둬?"}).json()["source"] == "unavailable"


@pytest.mark.parametrize("answer", [
    "오늘 나스닥 주가의 수치는 참고 자료에 없어 알려드리기 어렵습니다. 나스닥 공식 홈페이지에서 확인해 주세요.",
    "그 내용은 이 자료에는 없어요. 한국은행에서 확인해 주세요.",
    "정확한 값은 알 수 없어요.",
    "참고 자료에는 서울시 월세 지원 정책의 내용이 없어 정확히 안내하기 어렵습니다. 서울시 공식 누리집에서 확인해 주세요.",
    "테슬라의 현재 주가는 참고 자료에 없어 모릅니다.",
])
def test_an_honest_i_dont_have_that_needs_no_source(answer: str) -> None:
    assert validate_citations(answer, "오늘 나스닥 주가 알려줘", []) == []


def test_an_answer_with_a_number_or_no_refusal_still_needs_a_source() -> None:
    assert validate_citations("나스닥은 오늘 18,000을 넘었어요.", "나스닥?", [])
    assert validate_citations("자료에 없지만 지수는 18000이에요.", "나스닥?", [])  # a number rides along, so it needs a source
    assert validate_citations("나스닥은 미국 기술주 시장이에요.", "나스닥?", [])  # a plain claim is not a refusal
    used = [AnswerSource("미국 주가지수", None, None, "미국 주가지수 226.1")]
    assert validate_citations("미국 주가지수는 226.1이에요.", "미국 증시", used) == []


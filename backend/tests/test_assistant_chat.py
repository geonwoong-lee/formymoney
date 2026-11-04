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



def test_a_won_amount_may_be_read_in_man_units_but_not_rounded_or_changed() -> None:
    context = "[T1] 이자 계산 세후로 받는 돈은 7,453,800원이에요. 세후 이자는 253,800원이에요."

    assert validate_answer("세후로 745만 3,800원을 받아요.", "얼마 받아?", context) == []
    assert validate_answer("세후 이자는 25만 3,800원이에요.", "얼마 받아?", context) == []
    assert validate_answer("세후로 약 746만 원을 받아요.", "얼마 받아?", context) == ["참고 자료에 없는 숫자입니다: 746"]  # rounded up: a new number
    assert validate_answer("세후로 745만 4,000원을 받아요.", "얼마 받아?", context) == ["참고 자료에 없는 숫자입니다: 4,000"]


def test_saying_a_list_is_not_a_recommendation_is_allowed_but_recommending_is_not() -> None:
    assert validate_answer("총이자가 적은 순서로 줄 세웠을 뿐 추천은 아니에요.", "전세대출", "") == []
    assert validate_answer("이 상품은 추천이 아닙니다.", "전세대출", "") == []
    assert validate_answer("추천 순위가 아니라 조회 결과예요.", "전세대출", "") == []
    assert validate_answer("이 상품을 추천해요.", "전세대출", "") == ["사용할 수 없는 표현입니다: 추천"]



def test_a_source_id_written_with_brackets_or_lowercase_still_counts() -> None:
    from app.core.config import Settings
    from app.services.assistant_chat import AnswerSource, answer_question

    sources = {"T1": AnswerSource("전세자금대출 조회", "/rent-loans", None, "전세자금대출 조회 공시 금리는 연 4.00%부터 연 6.93%까지예요.")}
    for written in ("[T1]", "t1", " T1 "):
        reply = answer_question(
            Settings(_env_file=None), "전세대출 금리 알려줘", "[T1] " + sources["T1"].content, lambda *_: {"answer": "공시 금리는 연 4.00%부터 6.93%까지예요.", "link_paths": [], "source_ids": [written]}, sources,
        )
        assert reply.source == "ai" and [item.title for item in reply.sources] == ["전세자금대출 조회"], written


def test_a_plain_explanation_of_a_term_needs_no_source_but_a_claim_about_today_does() -> None:
    explanation = "단리는 원금에만 이자가 붙고, 복리는 이자에도 이자가 붙는 방식이에요."
    assert validate_citations(explanation, "단리랑 복리 차이가 뭐야?", []) == []
    assert validate_citations("코스피가 크게 올랐어요.", "코스피 어때?", [])  # not a definition question
    assert validate_citations("이자는 3.5%예요.", "단리가 뭐야?", [])  # a figure still needs a source


def test_hello_and_thanks_are_answered_without_the_model_or_the_rate_limit(client: TestClient) -> None:
    ask = _ask()
    client.app.state.assistant_ask = ask

    hello = client.post(URL, json={"message": "안녕!"}).json()
    thanks = client.post(URL, json={"message": "고마워요"}).json()
    question = client.post(URL, json={"message": "안녕하세요 월세 지원 알려줘"})

    assert hello["source"] == "rule" and "머니독" in hello["answer"] and len(hello["suggestions"]) == 3
    assert thanks["source"] == "rule" and "기뻐요" in thanks["answer"]
    assert question.status_code == 200 and len(ask.calls) >= 1  # a greeting with a question still goes to the model
    assert all(call["message"] == "안녕하세요 월세 지원 알려줘" for call in ask.calls)  # hello and thanks never did


def test_a_date_written_with_dots_may_be_read_as_year_month_day() -> None:
    context = "[T1] 우리은행 WON플러스예금: 공시 2026.10, 신청 기간 2026.01.05 ~ 2026.12.31, 세후 만기 10,304,560원"

    assert validate_answer("2026년 10월 공시 기준이에요.", "금리", context) == []
    assert validate_answer("신청은 2026년 1월 5일부터 12월 31일까지예요.", "기간", context) == []
    assert validate_answer("신청은 2026년 2월 5일부터예요.", "기간", context) == ["참고 자료에 없는 숫자입니다: 2"]  # a month the date does not have
    assert validate_answer("금리는 연 3.60%예요.", "금리", "금리 3.60%") == []  # a rate is not a date
    assert validate_answer("금리는 연 2026%예요.", "금리", "공시 2026.10") == []  # known and harmless: the year is in the text

from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.collectors.finlife_loan import LoanRate
from app.collectors.youth_policy import parse_policy
from app.services.assistant_tools import _age, _amounts, _last_region, _last_topic, _months, _rate, run_tools
from app.services.loan_service import save_loans
from app.services.youth_policy_service import save_youth_policies

SEOUL = "11110,11140"


def _policy(no: str, name: str, **extra):
    base = {
        "plcyNo": no, "plcyNm": name, "plcyKywdNm": "월세", "plcyExplnCn": "월세 지원", "plcySprtCn": "월 20만원을 지급해요",
        "lclsfNm": "주거", "sprtTrgtAgeLmtYn": "Y", "sprtTrgtMinAge": "19", "sprtTrgtMaxAge": "34", "aplyYmd": "20261101 ~ 20261230",
        "sprvsnInstCdNm": "서울특별시", "zipCd": SEOUL, "lastMdfcnDt": "2026-11-03 10:00:00",
    }
    return parse_policy({**base, **extra})


def _loan(company: str, low: str, high: str) -> LoanRate:
    return LoanRate(
        group="은행", company=company, product_code=company, product_name="전세론", repay_type="분할상환방식", rate_type="변동금리",
        rate_min=Decimal(low), rate_max=Decimal(high), loan_limit="최대 2억원", early_repay_fee="면제", delay_rate="+3%", join_way="영업점", disclosed_month="202610",
    )


def test_money_months_rate_age_region_and_topic_are_read_from_plain_korean() -> None:
    assert _amounts("월 30만원씩 넣어요") == [300_000]
    assert _amounts("1억 5천만원 빌릴래") == [150_000_000]
    assert _amounts("2천만원 예금, 3,000,000원 적금") == [20_000_000, 3_000_000]
    assert (_months("24개월"), _months("2년 동안"), _months("그냥")) == (24, 24, None)
    assert (_rate("연 4.5% 적금"), _rate("금리 40%"), _rate("금리가 높아")) == (Decimal("4.5"), None, None)
    assert (_age("27살인데"), _age("만 31세"), _age("5살")) == (27, 31, None)
    assert _last_region("서울 말고 경기는?") == "41"  # the later mention wins
    assert _last_topic("월세 말고 취업은?") == "취업"


def test_savings_calculation_uses_the_site_calculator_and_says_what_it_assumed() -> None:
    result = run_tools(None, "월 30만원 24개월 연 4% 적금이면 얼마 받아?", [])  # type: ignore[arg-type]

    assert len(result) == 1 and result[0].title == "이자 계산"
    # 300,000 × 4% / 12 × (24 × 25 / 2) = 300,000 interest on the schedule; 15.4% tax comes off the interest.
    assert "낸 돈 합계 7,200,000원" in result[0].content
    assert "이자 300,000원이에요" in result[0].content and "46,200원을 빼면 세후 이자는 253,800원" in result[0].content
    assert "7,500,000원" in result[0].content and "7,453,800원" in result[0].content and "단리" in result[0].content


def test_savings_calculation_asks_for_what_is_missing_and_ignores_unrelated_questions() -> None:
    asked = run_tools(None, "월 50만원 적금 이자 얼마야?", [])[0]  # type: ignore[arg-type]
    assert "기간, 연 이율(%)" in asked.content and "계산하지 못했어요" in asked.content
    assert run_tools(None, "요즘 환율 어때?", []) == []  # type: ignore[arg-type]
    assert run_tools(None, "예금자보호는 얼마까지 돼?", []) == []  # type: ignore[arg-type]


def test_a_follow_up_takes_the_missing_rate_from_the_earlier_question() -> None:
    result = run_tools(None, "금리가 4%면?", ["월 30만원 24개월 적금 이자 얼마야?"])  # type: ignore[arg-type]

    assert len(result) == 1 and "낸 돈 합계 7,200,000원" in result[0].content


def test_youth_policy_tool_filters_like_the_screen_and_is_not_a_recommendation(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        save_youth_policies(session, date(2026, 11, 4), [
            _policy("P1", "서울 청년 월세 지원"),
            _policy("P2", "부산 청년 월세 지원", zipCd="26110", sprvsnInstCdNm="부산광역시"),
            _policy("P3", "서울 청년 취업 수당", plcyKywdNm="취업", plcyNm="서울 청년 취업 수당", plcyExplnCn="구직 활동", lclsfNm="일자리"),
        ])
        seoul = run_tools(session, "서울 월세 지원 정책 있어?", [])
        follow_up = run_tools(session, "그럼 부산은?", ["서울 월세 지원 정책 있어?"])
        none = run_tools(session, "경기 창업 지원 있어?", [])

    assert len(seoul) == 1 and seoul[0].url == "/youth-policies"
    assert "1. 서울 청년 월세 지원" in seoul[0].content and "부산 청년" not in seoul[0].content and "추천이 아니에요" in seoul[0].content
    assert "지역 서울" in seoul[0].content and "검색어 월세" in seoul[0].content
    assert "부산 청년 월세 지원" in follow_up[0].content and "서울 청년" not in follow_up[0].content  # the topic carries over, the region changes
    assert "0개예요" in none[0].content or "찾은 것은 0" in none[0].content


def test_youth_policy_tool_says_so_when_nothing_was_collected(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        result = run_tools(session, "청년 지원 정책 알려줘", [])

    assert "아직 수집되지 않았어요" in result[0].content


def test_rent_loan_tool_defaults_are_stated_and_rates_are_a_range(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        save_loans(session, date(2026, 11, 4), [_loan("우리은행", "4.00", "4.70"), _loan("국민은행", "3.50", "4.20")])
        given = run_tools(session, "전세대출 2억 36개월이면 어때?", [])[0]
        assumed = run_tools(session, "전세자금대출 알려줘", [])[0]

    assert given.url == "/rent-loans" and "200,000,000원, 36개월 기준" in given.content and "질문에 있는 금액과 기간" in given.content
    assert "연 3.50%부터 가장 높은 곳 연 4.70%" in given.content
    assert "1. 국민은행" in given.content and "추천이 아니에요" in given.content  # ordered by total interest, not by quality
    assert "1억원, 24개월로 가정한 값" in assumed.content


def test_chat_endpoint_gives_the_model_the_tool_result_and_accepts_the_conversation(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        save_youth_policies(session, date(2026, 11, 4), [_policy("P1", "서울 청년 월세 지원")])
    seen: dict[str, str] = {}

    def ask(settings, context, message, feedback):
        seen["context"], seen["message"] = context, message
        return {"answer": "서울에서 신청할 수 있는 월세 지원 정책이 있어요. 청년정책 찾기에서 확인해 주세요.", "link_paths": ["/youth-policies"], "source_ids": ["T1"]}

    client.app.state.assistant_ask = ask
    client.app.state.knowledge_embed = lambda texts: [[0.0] * 512 for _ in texts]
    body = client.post("/api/v1/assistant/chat", json={
        "message": "서울 월세 지원 정책 있어?",
        "history": [{"role": "user", "text": "안녕"}, {"role": "assistant", "text": "안녕하세요"}],
    }).json()

    assert body["source"] == "ai" and body["links"] == [{"to": "/youth-policies", "label": "청년정책 찾기"}]
    assert "[T1]" in seen["context"] and "서울 청년 월세 지원" in seen["context"] and "[이전 대화]" in seen["context"]
    assert [item["title"] for item in body["sources"]] == ["청년정책 조회"]

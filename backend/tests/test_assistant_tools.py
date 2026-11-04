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
    assert _amounts("1억5천 2년이면") == [150_000_000]  # spoken: 1억 5천(만)
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
    assert run_tools(None, "오늘 기분이 어때?", []) == []  # type: ignore[arg-type]
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


def _deposit(company: str, name: str, base: str, best: str | None, months: int = 12, kind: str = "deposit"):
    from app.collectors.finlife import ProductRate

    return ProductRate(kind, "은행", company, f"{company}-{name}", name, months, "단리", "", Decimal(base), Decimal(best) if best else None, "202611")


def test_market_tool_pins_the_named_figure_with_its_date_and_change(client: TestClient) -> None:
    from app.services.market_service import MarketService

    with client.app.state.session_factory() as session:
        service = MarketService(session)
        service.save("base_rate", [("20261101", Decimal("3.00"))])
        service.save("usd_krw", [("20261102", Decimal("1330.5")), ("20261103", Decimal("1341"))])
        service.save("eur_krw", [("20261103", Decimal("1499.91"))])
        rate = run_tools(session, "기준금리 얼마야?", [])
        dollar = run_tools(session, "달러 환율 얼마야?", [])
        both = run_tools(session, "요즘 환율 어때?", [])
        none = run_tools(session, "삼성전자 주가 알려줘", [])

    assert rate[0].title == "시장 지표 조회" and "한국은행 기준금리: 2026년 11월 1일 기준 3%" in rate[0].content
    assert "원/달러: 2026년 11월 3일 기준 1,341원" in dollar[0].content and "10.5원 올랐어요" in dollar[0].content
    assert "원/유로" not in dollar[0].content  # a named currency narrows 환율 to that currency
    assert "원/유로" in both[0].content and "실시간 시세가 아니에요" in both[0].content
    assert none == []


def test_product_rate_tool_lists_disclosed_rates_in_the_sites_order_or_for_a_named_bank(client: TestClient) -> None:
    from app.services.product_rate_service import ProductRateService

    with client.app.state.session_factory() as session:
        ProductRateService(session).save_snapshot(date(2026, 11, 3), [
            _deposit("우리은행", "우리 정기예금", "3.00", "3.20"), _deposit("국민은행", "국민 정기예금", "3.50", None),
            _deposit("하나은행", "하나 정기예금", "2.80", "2.80"),
            _deposit("우리은행", "우리 적금", "3.80", "5.00", months=12, kind="saving"),
        ])
        top = run_tools(session, "정기예금 금리 높은 곳 알려줘", [])
        woori = run_tools(session, "우리은행 정기예금 금리 알려줘", [])
        missing = run_tools(session, "신한은행 정기예금 금리", [])
        calculation = run_tools(session, "연 3% 정기예금이면 이자 얼마야?", [])

    assert top[0].title == "예적금 금리 조회" and "추천이 아니라 순서일 뿐" in top[0].content
    assert top[0].content.index("국민은행") < top[0].content.index("하나은행")  # the site's order: more after-tax money first
    assert "가정: 맡기는 돈은 1,000만원으로 가정" in top[0].content
    assert "우리은행 우리 정기예금: 기본 연 3.00%, 우대 포함 최고 연 3.20%" in woori[0].content and "하나은행" not in woori[0].content
    assert "신한의 상품을 찾지 못했어요" in missing[0].content
    assert [r.title for r in calculation] == ["이자 계산"]  # a stated rate means a calculation, not a rate lookup


def test_youth_savings_tool_gives_the_official_terms_and_each_banks_rates(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        result = run_tools(session, "청년미래적금 금리가 몇 퍼센트야?", [])
        unrelated = run_tools(session, "청년미래적금이 뭐야?", [])

    assert result[0].title == "청년미래적금 조회" and result[0].url == "/banks"
    assert "가입 기간 36개월" in result[0].content and "정부기여금은 일반형 6%, 우대형 12%" in result[0].content and "비과세" in result[0].content
    assert "은행 14곳의 기본금리는 연 5%" in result[0].content and "- BNK부산은행" in result[0].content
    assert unrelated == []  # no figure asked for: the searched guide explains it


def test_a_rate_lookup_is_not_also_a_calculation_and_youth_savings_is_not_also_a_product_lookup(client: TestClient) -> None:
    from app.services.product_rate_service import ProductRateService

    with client.app.state.session_factory() as session:
        ProductRateService(session).save_snapshot(date(2026, 11, 3), [_deposit("우리은행", "우리 정기예금", "3.00", "3.20")])
        lookup = run_tools(session, "6개월 정기예금 금리 상위 보여줘", [])
        youth = run_tools(session, "청년미래적금 금리가 몇 퍼센트야?", [])
        calculation = run_tools(session, "연 3% 정기예금 1000만원 1년이면 이자가 얼마야?", [])

    assert [r.title for r in lookup] == ["예적금 금리 조회"]
    assert [r.title for r in youth] == ["청년미래적금 조회"]
    assert [r.title for r in calculation] == ["이자 계산"]


def test_the_screen_a_cited_lookup_came_from_is_always_offered() -> None:
    from app.core.config import Settings
    from app.services.assistant_chat import AnswerSource, answer_question

    sources = {"T1": AnswerSource("청년미래적금 조회", "/banks", None, "청년미래적금 조회 기본금리는 연 5%예요.")}
    reply = answer_question(
        Settings(_env_file=None), "청년미래적금 금리가 몇 퍼센트야?", "[T1] " + sources["T1"].content,
        lambda *_: {"answer": "기본금리는 연 5%예요.", "link_paths": ["/youth-policies"], "source_ids": ["T1"]}, sources,
    )

    assert [path for path, _label in reply.links] == ["/banks", "/youth-policies"]


def test_everyday_phrasings_reach_the_same_tools(client: TestClient) -> None:
    from app.services.market_service import MarketService
    from app.services.product_rate_service import ProductRateService

    with client.app.state.session_factory() as session:
        save_youth_policies(session, date(2026, 11, 4), [_policy("P1", "서울 청년 월세 지원"), _policy("P2", "청년 학자금 이자 지원", plcyKywdNm="학자금", lclsfNm="교육")])
        save_loans(session, date(2026, 11, 4), [_loan("우리은행", "4.00", "4.70")])
        ProductRateService(session).save_snapshot(date(2026, 11, 3), [_deposit("신한은행", "신한 정기예금", "3.10", "3.30")])
        MarketService(session).save("usd_krw", [("20261103", Decimal("1341"))])

        def titles(question: str) -> list[str]:
            return [result.title for result in run_tools(session, question, [])]

        for question in (
            "월세 보조금 받을 수 있는 거 있나요", "집 구할 때 도와주는 제도 알려주세요", "서울 사는 취준생인데 받을 수 있는 혜택이 뭐가 있어",
            "신혼부부 지원금 있어?", "대학생 학자금 도와주는 거 찾아줘",
        ):
            assert titles(question) == ["청년정책 조회"], question
        for question in ("전세 3억 빌리면 이자가 얼마나 나와요?", "전월세 대출 어디가 싸?", "집 보증금 대출 이율 알려줘"):
            assert titles(question) == ["전세자금대출 조회"], question
        for question in ("예금 이자 많이 주는 곳 알려줘", "신한 정기예금 금리", "예금 금리 비교해줘"):
            assert titles(question) == ["예적금 금리 조회"], question
        assert titles("지금 달러 얼마예요") == ["시장 지표 조회"]
        assert titles("청년 적금 정부 지원금 얼마 줘?") == ["청년미래적금 조회"]
        assert titles("예금자보호제도가 뭐야?") == []  # "제도" alone is not a youth-policy question
        assert titles("신한 정기예금 금리")  # an alias without 은행 finds the bank
        shinhan = run_tools(session, "신한 정기예금 금리", [])[0].content
        assert "신한은행 신한 정기예금" in shinhan


def test_asking_how_to_apply_adds_the_application_details_of_the_top_policies(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        save_youth_policies(session, date(2026, 11, 4), [_policy("P1", "서울 청년 월세 지원", plcyAplyMthdCn="복지로에서 온라인 신청", srngMthdCn="소득 순으로 선정", aplyUrlAddr="https://apply.example.kr/1")])
        detail = run_tools(session, "청년 월세 지원 신청 방법 알려줘", [])[0]
        plain = run_tools(session, "청년 월세 지원 있어?", [])[0]

    assert "신청 방법 복지로에서 온라인 신청" in detail.content and "선정 방법 소득 순으로 선정" in detail.content and "https://apply.example.kr/1" in detail.content
    assert "신청 방법" not in plain.content  # a plain search stays a short list


def test_the_policy_named_in_the_question_gets_the_details_not_just_the_one_due_first(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        save_youth_policies(session, date(2026, 11, 4), [
            _policy("P1", "서울 청년 월세 특별지원", plcyAplyMthdCn="구청 방문 신청", aplyYmd="20261105 ~ 20261110"),  # due first
            _policy("P2", "2026 청년 월세 지원", plcyAplyMthdCn="복지로에서 온라인 신청", srngMthdCn="소득 순으로 선정", aplyYmd="20261101 ~ 20261230"),
        ])
        detail = run_tools(session, "2026 청년 월세 지원 자격이 어떻게 돼?", [])[0]

    after_heading = detail.content.split("자세히 적어요")[1]
    assert after_heading.index("2026 청년 월세 지원: ") < after_heading.index("서울 청년 월세 특별지원: ")  # named policy first
    assert "복지로에서 온라인 신청" in after_heading


def _profile(**extra):
    from app.schemas.assistant_profile import AssistantProfile

    return AssistantProfile(**{"bankCode": "kb", "monthlyAmount": 300_000, "contributionType": "general", "startMonth": "2026-09", "enrollmentStatus": "enrolled", **extra})


def test_my_plan_is_worked_out_with_the_sites_calculators_from_what_the_visitor_typed(client: TestClient) -> None:
    from app.schemas.savings import Answer, CalculationRequest, ContributionType
    from app.services.savings_service import SavingsService

    with client.app.state.session_factory() as session:
        service = SavingsService(session)
        product = next(item for item in service.get_products().products if item.bank_code == "kb")
        code = product.conditions[0].code
        expected = service.calculate(CalculationRequest(
            monthly_amount=300_000, contribution_type=ContributionType.general, condition_answers={"kb": {code: Answer.yes}}, bank_codes=["kb"],
        )).results[0]
        result = run_tools(session, "내 적금 만기금액이 얼마야?", [], _profile(conditions={f"kb:{code}": "yes"}), date(2026, 11, 4))

    content = result[0].content
    assert result[0].title == "내 정보 계산" and result[0].url == "/conditions"
    assert f"예상 금리는 연 {expected.expected_rate:g}%" in content
    assert f"예상 만기금액은 {expected.expected_maturity_amount:,}원" in content
    assert "매달 300,000원" in content and "일반형" in content and "가입 중" in content
    assert "가입 2026년 9월, 만기 2029년 9월이고 지금은 2개월이 지나 34개월이 남았어요" in content
    assert "서버에 저장하지 않아요" in content and "충족 1개" in content
    assert "월별 납입 계획에 적은 금액" not in content  # no changed month, so no second calculation


def test_recorded_payments_that_differ_from_the_plan_change_the_maturity_and_say_by_how_much(client: TestClient) -> None:
    payments = {str(month): 300_000 for month in range(1, 37)} | {"5": 0, "6": 100_000}
    with client.app.state.session_factory() as session:
        plain = run_tools(session, "내 적금 만기금액이 얼마야?", [], _profile(), date(2026, 11, 4))[0].content
        recorded = run_tools(session, "내 적금 만기금액이 얼마야?", [], _profile(payments=payments), date(2026, 11, 4))[0].content

    assert "빠뜨린 달 1개월, 줄인 달 1개월" in recorded and "적어요" in recorded
    assert "계획대로일 때보다" in recorded and "계획대로일 때보다" not in plain


def test_without_saved_information_it_says_what_to_enter_and_other_questions_never_use_it(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        empty = run_tools(session, "내 적금 만기금액이 얼마야?", [], None, date(2026, 11, 4))
        other = run_tools(session, "코스피 얼마야?", [], _profile(), date(2026, 11, 4))
        bad_bank = run_tools(session, "내 적금 만기금액이 얼마야?", [], _profile(bankCode="no-such-bank"), date(2026, 11, 4))

    assert empty[0].title == "내 정보 조회" and "내 조건 화면에서" in empty[0].content
    assert all(result.title != "내 정보 계산" for result in other)  # a visitor's plan is not read out for unrelated questions
    assert bad_bank[0].title == "내 정보 조회"


def test_chat_endpoint_accepts_the_profile_and_rejects_oversized_or_malformed_ones(client: TestClient) -> None:
    seen: dict[str, str] = {}

    def ask(settings, context, message, feedback):
        seen["context"] = context
        return {"answer": "내 정보 기준으로 계산했어요.", "link_paths": [], "source_ids": ["T1"]}

    client.app.state.assistant_ask = ask
    client.app.state.knowledge_embed = lambda texts: [[0.0] * 512 for _ in texts]
    ok = client.post("/api/v1/assistant/chat", json={
        "message": "내 적금 만기금액이 얼마야?", "profile": {"bankCode": "kb", "monthlyAmount": 300000, "contributionType": "general", "startMonth": "2026-09", "enrollmentStatus": "enrolled"},
    })
    assert ok.status_code == 200 and "[T1] 내 정보 계산" in seen["context"]
    for profile in (
        {"monthlyAmount": 99_000_000}, {"startMonth": "2026/09"}, {"contributionType": "vip"},
        {"payments": {str(index): 1 for index in range(100)}}, {"conditions": {"kb:x": "maybe"}},
    ):
        assert client.post("/api/v1/assistant/chat", json={"message": "내 적금", "profile": profile}).status_code == 422, profile


def test_only_a_question_about_the_visitors_own_result_reads_their_plan() -> None:
    from app.services.assistant_tools import is_about_me

    for question in ("내 적금 만기금액이 얼마야?", "내 적금 언제 만기야?", "나는 얼마 받을 수 있어?", "내가 지금까지 얼마 넣었어?"):
        assert is_about_me(question), question
    for question in ("내 조건은 어디에 입력해?", "내 적금 만기 알림은 어떻게 받아?", "이번 달 납입을 못 했는데 어떻게 계산돼?", "코스피 얼마야?", "청년미래적금 금리가 몇 퍼센트야?"):
        assert not is_about_me(question), question


def test_bank_by_bank_rates_without_a_product_name_mean_the_sites_youth_savings_comparison(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        asked = run_tools(session, "은행별 기본금리가 어떻게 돼?", [])
        deposit = run_tools(session, "은행마다 정기예금 금리가 달라?", [])

    assert [result.title for result in asked] == ["청년미래적금 조회"]
    assert "청년미래적금 조회" not in [result.title for result in deposit]  # naming 예금 keeps it a deposit question

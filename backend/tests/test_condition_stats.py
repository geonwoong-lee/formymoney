from datetime import date

from fastapi.testclient import TestClient

from app.api.v1.endpoints import analytics as analytics_endpoint
from app.models.analytics import ConditionAnswerDailyCount
from app.services.condition_stats import MINIMUM_RESPONSES, ConditionStatsService

TODAY = date(2026, 11, 5)


def _kb_condition(body: dict, code: str) -> dict:
    bank = next(item for item in body["banks"] if item["bankCode"] == "kb")
    return next(item for item in bank["conditions"] if item["code"] == code)


def test_answers_are_counted_per_day_bank_condition_and_answer_only(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(analytics_endpoint, "korea_today", lambda: TODAY)
    payload = {"answers": {"kb": {"salary_transfer": "yes", "withdrawal_activity": "unknown"}, "shinhan": {}}}
    assert client.post("/api/v1/analytics/condition-answers", json=payload).status_code == 204
    assert client.post("/api/v1/analytics/condition-answers", json={"answers": {"kb": {"salary_transfer": "no"}}}).status_code == 204

    with client.app.state.session_factory() as session:
        rows = {(row.day, row.bank_code, row.condition_code, row.answer): row.count for row in session.query(ConditionAnswerDailyCount)}
    assert rows == {
        (TODAY, "kb", "salary_transfer", "yes"): 1,
        (TODAY, "kb", "salary_transfer", "no"): 1,
        (TODAY, "kb", "withdrawal_activity", "unknown"): 1,
    }
    # 사람·기기·IP를 구분하는 칸이 없다.
    assert {column.name for column in ConditionAnswerDailyCount.__table__.columns} == {
        "id", "day", "bank_code", "condition_code", "answer", "count"}


def test_unknown_bank_condition_or_answer_is_refused_and_nothing_is_kept(client: TestClient) -> None:
    for answers in (
        {"nowhere": {"salary_transfer": "yes"}},
        {"kb": {"made_up": "yes"}},
        {"kb": {"salary_transfer": "maybe"}},
        {"kb": {"salary_transfer": "yes", "made_up": "no"}},  # 하나라도 틀리면 전부 버린다
    ):
        assert client.post("/api/v1/analytics/condition-answers", json={"answers": answers}).status_code == 422
    with client.app.state.session_factory() as session:
        assert session.query(ConditionAnswerDailyCount).count() == 0


def test_conditions_with_few_answers_are_hidden_without_their_count(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(analytics_endpoint, "korea_today", lambda: TODAY)
    with client.app.state.session_factory() as session:
        service = ConditionStatsService(session)
        for index in range(MINIMUM_RESPONSES):
            service.record({"kb": {"salary_transfer": "yes" if index < 15 else "no"}}, TODAY)
        for _ in range(MINIMUM_RESPONSES - 1):
            service.record({"kb": {"withdrawal_activity": "yes"}}, TODAY)
        # 기간 밖의 응답은 세지 않는다.
        for _ in range(MINIMUM_RESPONSES):
            service.record({"kb": {"first_or_linked": "yes"}}, date(2026, 1, 1))

    body = client.get("/api/v1/analytics/condition-stats").json()

    assert body["minimumResponses"] == MINIMUM_RESPONSES
    assert (body["start"], body["end"]) == ("2026-08-08", "2026-11-05")
    salary = _kb_condition(body, "salary_transfer")
    assert salary["shown"] is True
    assert salary["responses"] == 20
    assert (salary["yesPercent"], salary["noPercent"], salary["unknownPercent"]) == (75.0, 25.0, 0.0)
    for code in ("withdrawal_activity", "first_or_linked"):
        hidden = _kb_condition(body, code)
        assert hidden["shown"] is False
        assert hidden["responses"] is None and hidden["yesPercent"] is None
    assert len(body["banks"]) == 14


def test_stats_period_cannot_be_chosen(client: TestClient, monkeypatch) -> None:
    """두 기간의 차이로 하루치 응답을 알아내지 못하도록 기간은 90일로 고정한다."""
    monkeypatch.setattr(analytics_endpoint, "korea_today", lambda: TODAY)
    body = client.get("/api/v1/analytics/condition-stats", params={"days": 7}).json()
    assert (body["start"], body["end"]) == ("2026-08-08", "2026-11-05")


def test_a_condition_with_any_small_answer_is_hidden_whole(client: TestClient, monkeypatch) -> None:
    """칸 몇 개만 숨기면 총 응답 수와 남은 비율로 거꾸로 계산되므로(예: 12/4/4), 작은 답이 하나라도 있으면 조건 전체를 숨긴다."""
    monkeypatch.setattr(analytics_endpoint, "korea_today", lambda: TODAY)
    with client.app.state.session_factory() as session:
        service = ConditionStatsService(session)
        for index in range(20):  # 예 19, 아니오 1
            service.record({"kb": {"salary_transfer": "yes" if index < 19 else "no"}}, TODAY)
        for index in range(20):  # 예 12, 아니오 4, 모름 4
            service.record({"kb": {"withdrawal_activity": "yes" if index < 12 else "no" if index < 16 else "unknown"}}, TODAY)
        for index in range(20):  # 예 15, 아니오 5, 모름 0 → 0건은 아무의 답도 아니라 보인다
            service.record({"kb": {"first_or_linked": "yes" if index < 15 else "no"}}, TODAY)

    body = client.get("/api/v1/analytics/condition-stats").json()
    for code in ("salary_transfer", "withdrawal_activity"):
        hidden = _kb_condition(body, code)
        assert hidden["shown"] is False
        assert (hidden["responses"], hidden["yesPercent"], hidden["noPercent"], hidden["unknownPercent"]) == (None, None, None, None)
    shown = _kb_condition(body, "first_or_linked")
    assert (shown["responses"], shown["yesPercent"], shown["noPercent"], shown["unknownPercent"]) == (20, 75.0, 25.0, 0.0)


def test_the_same_answer_added_many_times_keeps_one_row(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = ConditionStatsService(session)
        for _ in range(3):
            service.record({"kb": {"salary_transfer": "yes"}}, TODAY)
        rows = session.query(ConditionAnswerDailyCount).all()
    assert [(row.answer, row.count) for row in rows] == [("yes", 3)]


def test_oversized_or_badly_typed_payloads_are_refused_and_nothing_is_kept(client: TestClient) -> None:
    too_many_banks = {f"bank{index}": {"c": "yes"} for index in range(31)}
    too_many_answers = {"kb": {f"c{index}": "yes" for index in range(201)}}
    for payload in (
        {"answers": too_many_banks},
        {"answers": too_many_answers},
        {"answers": {"kb": "yes"}},
        {"answers": {"kb": {"salary_transfer": 1}}},
        {"answers": []},
        {},
    ):
        assert client.post("/api/v1/analytics/condition-answers", json=payload).status_code == 422
    with client.app.state.session_factory() as session:
        assert session.query(ConditionAnswerDailyCount).count() == 0


def test_condition_answers_share_the_statistics_rate_limit(client: TestClient) -> None:
    from app.services.rate_limiter import SlidingWindowLimiter

    client.app.state.analytics_limiter = SlidingWindowLimiter([(60, 1)])
    payload = {"answers": {"kb": {"salary_transfer": "yes"}}}
    assert client.post("/api/v1/analytics/condition-answers", json=payload).status_code == 204
    assert client.post("/api/v1/analytics/condition-answers", json=payload).status_code == 429


def test_limiter_forgets_addresses_after_the_longest_window() -> None:
    from app.services.rate_limiter import SlidingWindowLimiter

    now = [0.0]
    limiter = SlidingWindowLimiter([(60, 5)], clock=lambda: now[0])
    limiter.allow("203.0.113.1")
    now[0] = 61.0
    limiter.allow("203.0.113.2")
    now[0] = 130.0
    limiter.allow("203.0.113.3")
    assert "203.0.113.1" not in limiter.hits


def test_limiter_sweeps_even_when_the_request_is_refused() -> None:
    from app.services.rate_limiter import SlidingWindowLimiter

    now = [0.0]
    limiter = SlidingWindowLimiter([(60, 1)], clock=lambda: now[0])
    assert limiter.allow("203.0.113.1")
    now[0] = 30.0
    assert limiter.allow("203.0.113.9")
    now[0] = 70.0
    assert not limiter.allow("203.0.113.9")  # 거절되는 요청에서도 정리가 돈다
    assert "203.0.113.1" not in limiter.hits


def test_limiter_forgets_an_address_within_two_of_the_longest_window() -> None:
    """정리는 가장 긴 창마다 한 번이라, 정리 직후 만료된 주소도 다음 정리(두 창 안)에서 지워진다."""
    from app.services.rate_limiter import SlidingWindowLimiter

    now = [0.0]
    limiter = SlidingWindowLimiter([(60, 5)], clock=lambda: now[0])
    limiter.allow("203.0.113.1")
    now[0] = 59.0
    limiter.allow("203.0.113.7")
    now[0] = 61.0
    limiter.allow("203.0.113.2")  # 이 정리에서는 .7이 아직 만료 전
    assert "203.0.113.7" in limiter.hits
    now[0] = 122.0
    limiter.allow("203.0.113.2")
    assert "203.0.113.7" not in limiter.hits and "203.0.113.1" not in limiter.hits

from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.collectors.naver_news import Headline
from app.services.headline_ranking import Candidate, rank
from app.services.news_headline_service import NewsHeadlineService

NOW = datetime(2026, 10, 30, 6, 0, tzinfo=timezone.utc)


def _candidate(key: str, title: str, publisher: str, hours_ago: float = 2, title_ko: str | None = None) -> Candidate:
    return Candidate(key=key, title=title, title_ko=title_ko, publisher=publisher, published_at=NOW - timedelta(hours=hours_ago))


def test_topic_match_and_multi_publisher_coverage_raise_the_score() -> None:
    candidates = [
        _candidate("a1", "청년미래적금 출시 일정 공개", "a.co.kr"),
        _candidate("a2", "청년미래적금 출시 일정 공개 확정", "b.co.kr"),
        _candidate("a3", "청년미래적금 출시 일정 공개 발표", "c.co.kr"),
        _candidate("b1", "연예계 소식 화제", "d.co.kr"),
        _candidate("c1", "예금 금리 동향 점검", "e.co.kr", hours_ago=30),
    ]

    ranked = rank(candidates, "domestic", NOW)

    assert [item.key for item in ranked][:2] == ["a1", "c1"]
    assert "청년미래적금 관련" in ranked[0].reasons
    assert "3곳의 언론이 같은 소식을 다룸" in ranked[0].reasons
    assert all(item.key != "b1" for item in ranked)


def test_same_event_appears_once_and_limit_is_respected() -> None:
    candidates = [_candidate(f"k{i}", f"기준금리 동결 소식 {i}번째 뉴스 {i}", f"p{i}.kr") for i in range(3)]
    words = ["하나", "신한", "국민", "우리", "농협", "기업", "수협"]
    candidates += [_candidate(f"z{i}", f"예금 {words[i]}은행 {i}월 특판 소식{i}", f"q{i}.kr") for i in range(7)]

    ranked = rank(candidates, "domestic", NOW, limit=5)

    assert len(ranked) == 5
    assert sum(1 for item in ranked if item.key.startswith("k")) == 1


def test_international_rules_use_english_and_korean_titles() -> None:
    candidates = [
        _candidate("e1", "Monetary policy decisions", "European Central Bank", title_ko="통화정책 결정"),
        _candidate("e2", "Banknote design update", "European Central Bank"),
    ]

    ranked = rank(candidates, "international", NOW)

    assert [item.key for item in ranked] == ["e1"]
    assert "통화정책 관련" in ranked[0].reasons


def test_featured_endpoint_returns_reasons(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    headlines = [
        Headline("청년미래적금 가입 안내", "a.co.kr", "https://a.co.kr/1", now - timedelta(hours=1)),
        Headline("연예계 소식", "b.co.kr", "https://b.co.kr/1", now - timedelta(hours=1)),
    ]
    with client.app.state.session_factory() as session:
        NewsHeadlineService(session).save("naver", "domestic", "적금", headlines, now)

    body = client.get("/api/v1/daily/headlines", params={"region": "domestic", "featured": "true"}).json()

    assert [item["title"] for item in body["items"]] == ["청년미래적금 가입 안내"]
    assert "청년미래적금 관련" in body["items"][0]["reasons"]

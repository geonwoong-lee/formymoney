from datetime import datetime, timedelta, timezone

from fastapi.testclient import TestClient

from app.collectors.naver_news import Headline
from app.collectors.official_rss import LINK_ONLY_FEEDS, parse_feed
from app.services.news_digest import build_sources
from app.services.news_headline_service import NewsHeadlineService

BOK = LINK_ONLY_FEEDS[0]
RSS = """<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<item><title>[보도참고자료] 2026년 11월 통화안정증권 발행 계획</title>
<link><![CDATA[https://www.bok.or.kr/portal/bbs/B0000502/view.do?nttId=11066078&menuNo=200690]]></link>
<description><![CDATA[&lt;p&gt;자세한 내용은 첨부파일을 참고하시기 바랍니다.&lt;/p&gt;]]></description>
<pubDate>Thu, 29 Oct 2026 12:00:00 +0900</pubDate></item>
<item><title>다른 사이트</title><link>https://example.com/x</link><pubDate>Thu, 29 Oct 2026 12:00:00 +0900</pubDate></item>
</channel></rss>"""


def test_bok_feed_keeps_title_date_and_official_link_only() -> None:
    [headline] = parse_feed(BOK, RSS)

    assert headline.title == "[보도참고자료] 2026년 11월 통화안정증권 발행 계획"
    assert headline.publisher == "한국은행"
    assert headline.url.startswith("https://www.bok.or.kr/portal/bbs/B0000502/view.do?nttId=11066078")
    assert headline.published_at == datetime(2026, 10, 29, 3, 0, tzinfo=timezone.utc)
    assert headline.snippet == ""


def test_bok_titles_stay_out_of_general_lists_featured_and_digest(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    with client.app.state.session_factory() as session:
        service = NewsHeadlineService(session)
        service.save("naver", "domestic", "기준금리", [Headline("기준금리 동결 결정", "a.co.kr", "https://a.co.kr/1", now - timedelta(hours=1))], now)
        service.save("bok_press", "domestic", "한국은행", [Headline("한국은행 기준금리 결정 회의 결과", "한국은행", "https://www.bok.or.kr/1", now - timedelta(hours=1))], now)
        sources = build_sources(session, {}, now)

    assert [source.url for source in sources] == ["https://a.co.kr/1"]
    general = client.get("/api/v1/daily/headlines", params={"region": "domestic"}).json()["items"]
    assert [item["provider"] for item in general] == ["naver"]
    featured = client.get("/api/v1/daily/headlines", params={"region": "domestic", "featured": "true"}).json()["items"]
    assert all(item["provider"] != "bok_press" for item in featured)
    bok = client.get("/api/v1/daily/headlines", params={"region": "domestic", "provider": "bok_press"}).json()["items"]
    assert [(item["title"], item["publisher"], item["titleKo"], item["summaryKo"]) for item in bok] == [
        ("한국은행 기준금리 결정 회의 결과", "한국은행", None, None),
    ]


def test_unknown_provider_is_rejected(client: TestClient) -> None:
    assert client.get("/api/v1/daily/headlines", params={"provider": "google_news"}).status_code == 422


def test_bok_list_drops_rows_that_do_not_link_to_the_bank_of_korea(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    with client.app.state.session_factory() as session:
        NewsHeadlineService(session).save("bok_press", "domestic", "한국은행", [
            Headline("정상 보도자료", "한국은행", "https://www.bok.or.kr/portal/1", now),
            Headline("외부 링크", "한국은행", "https://example.com/bok", now),
            Headline("http 링크", "한국은행", "http://www.bok.or.kr/portal/2", now),
        ], now)

    items = client.get("/api/v1/daily/headlines", params={"region": "domestic", "provider": "bok_press"}).json()["items"]

    assert [item["title"] for item in items] == ["정상 보도자료"]


def test_featured_and_provider_together_are_rejected(client: TestClient) -> None:
    response = client.get("/api/v1/daily/headlines", params={"region": "domestic", "provider": "bok_press", "featured": "true"})

    assert response.status_code == 422


def test_bad_links_do_not_crowd_out_valid_ones_under_the_limit(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    with client.app.state.session_factory() as session:
        NewsHeadlineService(session).save("bok_press", "domestic", "한국은행", [
            *[Headline(f"외부 {i}", "한국은행", f"https://example.com/{i}", now - timedelta(minutes=i)) for i in range(3)],
            *[Headline(f"정상 {i}", "한국은행", f"https://www.bok.or.kr/portal/{i}", now - timedelta(hours=1, minutes=i)) for i in range(3)],
        ], now)

    items = client.get("/api/v1/daily/headlines", params={"region": "domestic", "provider": "bok_press", "limit": 3}).json()["items"]

    assert [item["title"] for item in items] == ["정상 0", "정상 1", "정상 2"]

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.collectors.naver_news import Headline, NaverNewsError, _request_target, clean_title, parse_items
from app.core.config import Settings
from app.models.daily_briefing import NewsHeadline
from app.services.news_headline_service import HEADLINE_RETENTION_DAYS, NewsHeadlineService


def _headline(number: int, **changes: object) -> Headline:
    values = {
        "title": f"기준금리 동결 {number}",
        "publisher": "example.co.kr",
        "url": f"https://example.co.kr/news/{number}",
        "published_at": datetime(2026, 10, 30, 1, number, tzinfo=timezone.utc),
    }
    values.update(changes)
    return Headline(**values)


def test_parse_items_keeps_only_title_link_and_time() -> None:
    payload = {"items": [{
        "title": "<b>기준금리</b> &quot;동결&quot;",
        "originallink": "https://www.example.co.kr/a/1",
        "link": "https://n.news.naver.com/mnews/article/1",
        "description": "본문 일부는 저장하지 않습니다.",
        "pubDate": "Fri, 30 Oct 2026 14:38:41 +0900",
    }]}

    [headline] = parse_items(payload)

    assert headline.title == '기준금리 "동결"'
    assert headline.publisher == "example.co.kr"
    assert headline.url == "https://www.example.co.kr/a/1"
    assert headline.published_at == datetime(2026, 10, 30, 5, 38, 41, tzinfo=timezone.utc)
    assert not hasattr(headline, "description")


def test_parse_items_skips_unsafe_or_incomplete_items() -> None:
    payload = {"items": [
        {"title": "x", "originallink": "javascript:alert(1)", "pubDate": "Fri, 30 Oct 2026 14:38:41 +0900"},
        {"title": "", "originallink": "https://a.kr/1", "pubDate": "Fri, 30 Oct 2026 14:38:41 +0900"},
        {"title": "시간 없음", "originallink": "https://a.kr/2", "pubDate": "not a date"},
        "not a dict",
    ]}

    assert parse_items(payload) == []


def test_clean_title_collapses_whitespace_and_tags() -> None:
    assert clean_title("<b>예금</b>   금리\n상승") == "예금 금리 상승"


def test_hub_keys_win_over_developer_keys_and_missing_keys_fail() -> None:
    both = Settings(naver_hub_key_id="h1", naver_hub_key="h2", naver_client_id="c1", naver_client_secret="c2", _env_file=None)
    url, headers = _request_target(both, "예금", 5)
    assert url.startswith("https://naverapihub.apigw.ntruss.com/")
    assert "X-NCP-APIGW-API-KEY" in headers

    developers = Settings(naver_client_id="c1", naver_client_secret="c2", _env_file=None)
    url, headers = _request_target(developers, "예금", 5)
    assert url.startswith("https://openapi.naver.com/")
    assert headers["X-Naver-Client-Id"] == "c1"

    with pytest.raises(NaverNewsError) as error:
        _request_target(Settings(_env_file=None), "예금", 5)
    assert "c1" not in str(error.value)


def test_save_is_idempotent_and_api_returns_newest_first(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    with client.app.state.session_factory() as session:
        service = NewsHeadlineService(session)
        assert service.save("naver", "domestic", "기준금리", [_headline(1), _headline(2)], now) == 2
        assert service.save("naver", "domestic", "기준금리", [_headline(2), _headline(3)], now) == 1

    body = client.get("/api/v1/daily/headlines", params={"region": "domestic"}).json()

    assert [item["title"] for item in body["items"]] == ["기준금리 동결 3", "기준금리 동결 2", "기준금리 동결 1"]
    assert body["items"][0]["publisher"] == "example.co.kr"
    assert client.get("/api/v1/daily/headlines", params={"region": "international"}).json()["items"] == []


def test_expired_headlines_are_hidden_and_purged(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    old = now - timedelta(days=HEADLINE_RETENTION_DAYS + 1)
    with client.app.state.session_factory() as session:
        service = NewsHeadlineService(session)
        service.save("naver", "domestic", "예금", [_headline(1)], old)
        service.save("naver", "domestic", "예금", [_headline(2)], now)

    assert [item["title"] for item in client.get("/api/v1/daily/headlines").json()["items"]] == ["기준금리 동결 2"]
    with client.app.state.session_factory() as session:
        assert NewsHeadlineService(session).purge_expired() == 1
        assert session.query(NewsHeadline).count() == 1


def test_headlines_reject_unknown_region(client: TestClient) -> None:
    assert client.get("/api/v1/daily/headlines", params={"region": "mars"}).status_code == 422


FED_FEED = """<?xml version="1.0" encoding="utf-8" ?>
<rss version="2.0"><channel><title>FRB</title>
<item><title>Federal Reserve Board announces   something</title>
<link><![CDATA[https://www.federalreserve.gov/newsevents/pressreleases/other20261029a.htm]]></link>
<pubDate><![CDATA[Thu, 29 Oct 2026 20:30:00 GMT]]></pubDate></item>
<item><title>Off-host link is dropped</title>
<link>https://evil.example/x</link><pubDate>Thu, 29 Oct 2026 20:30:00 GMT</pubDate></item>
<item><title>No date is dropped</title>
<link>https://www.federalreserve.gov/a.htm</link></item>
</channel></rss>"""


def test_official_feed_keeps_only_same_host_https_items() -> None:
    from app.collectors.official_rss import OFFICIAL_FEEDS, OfficialRssError, parse_feed

    fed = OFFICIAL_FEEDS[0]
    [headline] = parse_feed(fed, "﻿" + FED_FEED)

    assert headline.title == "Federal Reserve Board announces something"
    assert headline.publisher == "Federal Reserve Board"
    assert headline.url.startswith("https://www.federalreserve.gov/")
    assert headline.published_at == datetime(2026, 10, 29, 20, 30, tzinfo=timezone.utc)
    with pytest.raises(OfficialRssError):
        parse_feed(fed, "<html>not a feed")

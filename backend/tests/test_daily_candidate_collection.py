from datetime import date, datetime, timezone

from fastapi.testclient import TestClient

from app.collectors.official_news import (
    CollectedCandidate,
    CollectionBatch,
    SourceCollectionResult,
    collect_official_candidates,
)
from app.schemas.daily_briefing import CAUTION_TEXT


HEADERS = {"X-Very-Rich-Ingest-Secret": "test-ingest-secret"}
COLLECT_URL = "/api/v1/internal/daily/candidates/collect"


def test_collector_uses_fsc_listing_fallback_and_keeps_bok_discovery_only() -> None:
    fsc_html = b"""
    <html><body><ul><li><div class='inner'><div class='cont'><div class='subject'>
    <a href='/no010101/88013?curPage=1'>Official FSC title</a></div></div>
    <div class='day'>2026-10-28</div></div></li></ul></body></html>
    """
    bok_xml = b"""<?xml version='1.0' encoding='UTF-8'?><rss><channel><item>
    <title>Official BOK title</title>
    <link>https://www.bok.or.kr/portal/bbs/B0000552/view.do?nttId=123</link>
    <guid>bok-123</guid><pubDate>Wed, 28 Oct 2026 09:00:00 +0900</pubDate>
    </item></channel></rss>"""

    def fake_fetch(url: str) -> tuple[bytes, str]:
        if "fsc_bbs_rss" in url:
            raise RuntimeError("RSS unavailable")
        if "fsc.go.kr/no010101" in url:
            return fsc_html, "https://www.fsc.go.kr/no010101"
        return bok_xml, "https://www.bok.or.kr/portal/bbs/B0000552/news.rss?menuNo=200690"

    batch = collect_official_candidates(date(2026, 10, 28), fake_fetch, lambda _: None)

    assert [result.status for result in batch.results] == ["fallback", "ok"]
    assert batch.results[0].candidates[0].source_item_id == "88013"
    assert batch.results[1].candidates[0].source_code == "bok_press"


def _fake_batch(_: date) -> CollectionBatch:
    return CollectionBatch(
        results=(
            SourceCollectionResult(
                source_code="fsc_press",
                status="fallback",
                detail="공식 목록 대체 수집",
                candidates=(
                    CollectedCandidate(
                        source_code="fsc_press",
                        source_item_id="88013",
                        original_title="금융위원회 공식 발표",
                        canonical_url="https://www.fsc.go.kr/no010101/88013",
                        published_at=datetime(2026, 10, 28, 9, tzinfo=timezone.utc),
                    ),
                ),
            ),
            SourceCollectionResult(
                source_code="bok_press",
                status="ok",
                detail="발견 전용 RSS 확인 완료",
                candidates=(
                    CollectedCandidate(
                        source_code="bok_press",
                        source_item_id="123",
                        original_title="한국은행 공식 발표",
                        canonical_url="https://www.bok.or.kr/portal/bbs/B0000552/view.do?nttId=123",
                        published_at=datetime(2026, 10, 28, 8, tzinfo=timezone.utc),
                    ),
                ),
            ),
        )
    )


def test_candidate_collection_requires_secret_and_separates_usage(client: TestClient) -> None:
    client.app.state.daily_candidate_collector = _fake_batch

    unauthorized = client.get(COLLECT_URL, params={"date": "2026-10-28"})
    response = client.get(COLLECT_URL, params={"date": "2026-10-28"}, headers=HEADERS)

    assert unauthorized.status_code == 401
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert len(body["candidates"]) == 2
    assert body["candidates"][0]["eligibleForSummary"] is True
    assert body["candidates"][1]["usageStatus"] == "discovery_only"


def test_existing_briefing_is_removed_from_collection_candidates(client: TestClient) -> None:
    client.app.state.daily_candidate_collector = _fake_batch
    ingest_payload = {
        "sourceCode": "fsc_press",
        "sourceItemId": "88013",
        "canonicalUrl": "https://www.fsc.go.kr/no010101/88013",
        "originalTitle": "금융위원회 공식 발표",
        "publishedAt": "2026-10-28T09:00:00+00:00",
        "fetchedAt": "2026-10-28T10:00:00+00:00",
        "contentSha256": "c" * 64,
        "evidence": [{"id": "p1", "text": "금융위원회가 공식 정책을 발표했습니다."}],
        "summary": {
            "schemaVersion": "1.0",
            "sourceItemId": "88013",
            "plainHeadline": "금융위원회가 정책을 발표했어요",
            "summaryPoints": [{"text": "금융위원회가 공식 정책을 발표했습니다.", "evidenceIds": ["p1"]}],
            "whyItMatters": {"text": "공식 내용을 확인할 수 있습니다.", "evidenceIds": ["p1"]},
            "relatedTerms": [],
            "caution": CAUTION_TEXT,
        },
        "modelName": "test-model",
        "promptVersion": "1.0",
        "generatedAt": "2026-10-28T11:00:00+00:00",
        "inputTokens": 1,
        "outputTokens": 1,
    }
    ingested = client.post("/api/v1/internal/daily/briefings", json=ingest_payload, headers=HEADERS)
    response = client.get(COLLECT_URL, params={"date": "2026-10-28"}, headers=HEADERS)

    assert ingested.status_code == 200
    assert response.status_code == 200
    assert response.json()["duplicateCount"] == 1
    assert [item["sourceCode"] for item in response.json()["candidates"]] == ["bok_press"]


def test_all_source_failures_return_safe_status(client: TestClient) -> None:
    client.app.state.daily_candidate_collector = lambda _: CollectionBatch(
        results=(
            SourceCollectionResult("fsc_press", "failed", (), "금융위원회 공식 자료를 읽지 못했습니다."),
            SourceCollectionResult("bok_press", "failed", (), "한국은행 공식 RSS를 읽지 못했습니다."),
        )
    )

    response = client.get(COLLECT_URL, params={"date": "2026-10-28"}, headers=HEADERS)

    assert response.status_code == 200
    assert response.json()["status"] == "all_failed"
    assert response.json()["candidates"] == []

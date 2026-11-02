from datetime import date

from fastapi.testclient import TestClient

from app.api.v1.endpoints import events as events_endpoint
from app.services.events import EVENTS, upcoming


def test_every_event_links_to_an_official_https_source_and_has_a_unique_key() -> None:
    assert len({event.key for event in EVENTS}) == len(EVENTS)
    assert all(event.source_url.startswith("https://") for event in EVENTS)
    assert [event.day for event in EVENTS] == sorted(event.day for event in EVENTS)
    assert all(event.tentative for event in EVENTS if event.kind == "fomc" and event.day.year == 2027)


def test_the_dates_match_the_official_schedules_checked_on_2026_11_02() -> None:
    # Bank of Korea, Federal Reserve, 국가데이터처 2026 보도계획, North Carolina State Board of Elections.
    assert [(event.day.isoformat(), event.kind) for event in EVENTS] == [
        ("2026-11-03", "election"), ("2026-11-03", "statistics"), ("2026-11-11", "statistics"),
        ("2026-11-26", "rate_decision"), ("2026-11-30", "statistics"), ("2026-12-02", "statistics"),
        ("2026-12-09", "fomc"), ("2026-12-16", "statistics"), ("2026-12-30", "statistics"), ("2026-12-31", "statistics"),
        ("2027-01-27", "fomc"), ("2027-03-17", "fomc"), ("2027-04-28", "fomc"), ("2027-06-09", "fomc"),
        ("2027-07-28", "fomc"), ("2027-09-15", "fomc"), ("2027-10-27", "fomc"), ("2027-12-08", "fomc"),
    ]
    titles = {event.key: event.title for event in EVENTS}
    assert titles["fomc-2026-12-09"] == "미국 연준 FOMC 정례회의(12월 8~9일)"
    assert titles["stats-2026-12-31-cpi"] == "국가데이터처 2026년 12월 및 연간 소비자물가동향 발표"
    assert titles["election-us-2026-11-03"] == "미국 중간선거(연방 하원 전체와 상원 일부)"


def test_upcoming_keeps_today_and_the_window_only() -> None:
    found = upcoming(date(2026, 11, 3), 23)

    assert [event.key for event in found] == [
        "election-us-2026-11-03", "stats-2026-11-03-cpi", "stats-2026-11-11-employment", "bok-2026-11-26",
    ]
    assert upcoming(date(2028, 1, 1), 30) == []


def test_events_endpoint_returns_d_day_from_the_korean_date(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(events_endpoint, "korea_today", lambda: date(2026, 11, 25))

    body = client.get("/api/v1/events", params={"days": 2}).json()

    assert body["today"] == "2026-11-25"
    assert body["items"] == [{
        "key": "bok-2026-11-26", "date": "2026-11-26", "dDay": 1, "kind": "rate_decision",
        "title": "한국은행 금융통화위원회(금통위) 기준금리 결정", "why": EVENTS[3].why,
        "sourceName": "한국은행 통화정책방향 결정회의 일정",
        "sourceUrl": "https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755",
        "checkedOn": "2026-11-02", "tentative": False,
    }]
    assert client.get("/api/v1/events", params={"days": 0}).status_code == 422
    assert client.get("/api/v1/events", params={"days": 401}).status_code == 422

    monkeypatch.setattr(events_endpoint, "korea_today", lambda: date(2026, 11, 26))
    assert client.get("/api/v1/events", params={"days": 1}).json()["items"][0]["dDay"] == 0

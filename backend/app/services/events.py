"""Upcoming official economic and political dates shown on /daily and searchable by 머니독.

Every date was read from the organiser's own page on the checked day, and each entry links to it.
Political entries carry only the date and what is decided, never a view on the outcome.
Add next year's dates once the organiser publishes them (Bank of Korea lists 2027 meetings later).
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Literal

EventKind = Literal["rate_decision", "fomc", "statistics", "election"]

BOK_SCHEDULE = "https://www.bok.or.kr/portal/singl/crncyPolicyDrcMtg/listYear.do?mtgSe=A&menuNo=200755"
FED_SCHEDULE = "https://www.federalreserve.gov/monetarypolicy/fomccalendars.htm"
STATS_SCHEDULE = "https://mods.go.kr/ansk/file/schedule_2026.pdf"
US_ELECTION = "https://www.ncsbe.gov/news/events/election-day-2026-general-election"

WHY: dict[str, str] = {
    "rate_decision": "한국은행이 기준금리를 올릴지, 그대로 둘지, 내릴지 정하는 날이에요. 결과에 따라 예금·대출 금리가 따라 움직이는 일이 많아요.",
    "fomc": "미국 중앙은행(연준)이 정책금리를 정하는 회의예요. 결과는 한국 시간으로 다음 날 새벽에 나오고, 환율과 세계 증시가 주목해요.",
    "cpi": "지난달 물가가 얼마나 올랐는지 발표하는 날이에요. 물가는 한국은행이 기준금리를 정할 때 중요하게 보는 숫자예요.",
    "employment": "지난달 일자리가 얼마나 늘거나 줄었는지 발표하는 날이에요.",
    "industry": "지난달 생산·소비·투자가 어땠는지 발표하는 날이에요.",
    "election": "선거 결과에 따라 정책 방향이 바뀔 수 있어 금융시장이 지켜보는 일정이에요.",
}


@dataclass(frozen=True)
class Event:
    key: str
    day: date
    kind: EventKind
    title: str
    why: str
    source_name: str
    source_url: str
    checked_on: date
    tentative: bool = False


CHECKED = date(2026, 11, 2)


def _bok(day: date) -> Event:
    return Event(
        f"bok-{day.isoformat()}", day, "rate_decision", "한국은행 금융통화위원회(금통위) 기준금리 결정", WHY["rate_decision"],
        "한국은행 통화정책방향 결정회의 일정", BOK_SCHEDULE, CHECKED,
    )


def _fomc(first: date, second: date, tentative: bool = False) -> Event:
    return Event(
        f"fomc-{second.isoformat()}", second, "fomc", f"미국 연준 FOMC 정례회의({first.month}월 {first.day}~{second.day}일)", WHY["fomc"],
        "미국 연방준비제도 FOMC 일정", FED_SCHEDULE, CHECKED, tentative,
    )


def _stats(day: date, title: str, why: str) -> Event:
    return Event(
        f"stats-{day.isoformat()}-{why}", day, "statistics", f"국가데이터처 {title} 발표", WHY[why],
        "국가데이터처 2026년 물가·고용·산업활동동향 보도계획", STATS_SCHEDULE, CHECKED,
    )


EVENTS: list[Event] = sorted([
    _stats(date(2026, 11, 3), "2026년 10월 소비자물가동향", "cpi"),
    Event(
        "election-us-2026-11-03", date(2026, 11, 3), "election", "미국 중간선거(연방 하원 전체와 상원 일부)", WHY["election"],
        "미국 노스캐롤라이나주 선거관리위원회 안내", US_ELECTION, CHECKED,
    ),
    _stats(date(2026, 11, 11), "2026년 10월 고용동향", "employment"),
    _bok(date(2026, 11, 26)),
    _stats(date(2026, 11, 30), "2026년 10월 산업활동동향", "industry"),
    _stats(date(2026, 12, 2), "2026년 11월 소비자물가동향", "cpi"),
    _fomc(date(2026, 12, 8), date(2026, 12, 9)),
    _stats(date(2026, 12, 16), "2026년 11월 고용동향", "employment"),
    _stats(date(2026, 12, 30), "2026년 11월 산업활동동향", "industry"),
    _stats(date(2026, 12, 31), "2026년 12월 및 연간 소비자물가동향", "cpi"),
    # The Fed marks every 2027 date tentative until confirmed at the meeting before it.
    _fomc(date(2027, 1, 26), date(2027, 1, 27), tentative=True),
    _fomc(date(2027, 3, 16), date(2027, 3, 17), tentative=True),
    _fomc(date(2027, 4, 27), date(2027, 4, 28), tentative=True),
    _fomc(date(2027, 6, 8), date(2027, 6, 9), tentative=True),
    _fomc(date(2027, 7, 27), date(2027, 7, 28), tentative=True),
    _fomc(date(2027, 9, 14), date(2027, 9, 15), tentative=True),
    _fomc(date(2027, 10, 26), date(2027, 10, 27), tentative=True),
    _fomc(date(2027, 12, 7), date(2027, 12, 8), tentative=True),
], key=lambda event: (event.day, event.key))


def upcoming(today: date, days: int, events: list[Event] = EVENTS) -> list[Event]:
    """Events from today (included) up to `days` days ahead, earliest first."""
    return [event for event in events if 0 <= (event.day - today).days <= days]

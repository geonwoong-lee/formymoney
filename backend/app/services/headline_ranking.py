"""Rule-based "오늘 주요 뉴스" selection. No model decides what matters; every point has a visible reason."""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

TOKEN_PATTERN = re.compile(r"[0-9A-Za-z가-힣]{2,}")
SAME_EVENT_OVERLAP = 0.5
SAME_EVENT_MIN_SHARED = 3
MAX_PUBLISHER_BONUS = 4

# (keyword, points, label). Matched against the original and Korean titles, case-insensitively.
KEYWORDS: dict[str, list[tuple[str, int, str]]] = {
    "domestic": [
        ("청년미래적금", 5, "청년미래적금 관련"),
        ("기준금리", 4, "기준금리 관련"),
        ("예금자보호", 3, "예금자보호 관련"),
        ("예금", 3, "예금 관련"),
        ("적금", 3, "적금 관련"),
        ("금리", 2, "금리 관련"),
        ("가계대출", 1, "가계대출 관련"),
    ],
    "international": [
        ("monetary policy", 4, "통화정책 관련"),
        ("fomc", 4, "FOMC 관련"),
        ("interest rate", 4, "금리 관련"),
        ("inflation", 3, "물가 관련"),
        ("deposit", 3, "예금 관련"),
        ("통화정책", 4, "통화정책 관련"),
        ("금리", 3, "금리 관련"),
    ],
}


@dataclass(frozen=True)
class Candidate:
    key: str
    title: str
    title_ko: str | None
    publisher: str
    published_at: datetime


@dataclass(frozen=True)
class Ranked:
    key: str
    score: int
    reasons: list[str]


def _tokens(text: str) -> set[str]:
    return {token.lower() for token in TOKEN_PATTERN.findall(text)}


def _same_event(left: set[str], right: set[str]) -> bool:
    if not left or not right:
        return False
    shared = len(left & right)
    return shared >= SAME_EVENT_MIN_SHARED and shared / min(len(left), len(right)) >= SAME_EVENT_OVERLAP


def rank(candidates: list[Candidate], region: str, now: datetime, limit: int = 5) -> list[Ranked]:
    def aware(moment: datetime) -> datetime:
        return moment if moment.tzinfo else moment.replace(tzinfo=timezone.utc)

    candidates = [
        Candidate(item.key, item.title, item.title_ko, item.publisher, aware(item.published_at)) for item in candidates
    ]
    groups: list[list[Candidate]] = []
    group_tokens: list[set[str]] = []
    for candidate in sorted(candidates, key=lambda item: item.published_at, reverse=True):
        tokens = _tokens(candidate.title)
        for index, existing in enumerate(group_tokens):
            if _same_event(tokens, existing):
                groups[index].append(candidate)
                group_tokens[index] |= tokens
                break
        else:
            groups.append([candidate])
            group_tokens.append(tokens)

    ranked: list[Ranked] = []
    for group in groups:
        lead = group[0]
        text = f"{lead.title} {lead.title_ko or ''}".lower()
        score = 0
        reasons: list[str] = []
        matched = [(points, label) for keyword, points, label in KEYWORDS.get(region, []) if keyword in text]
        if matched:
            points, label = max(matched)
            score += points
            reasons.append(label)
        publishers = {item.publisher for item in group}
        if len(publishers) > 1:
            score += min(len(publishers), MAX_PUBLISHER_BONUS) * 2
            reasons.append(f"{len(publishers)}곳의 언론이 같은 소식을 다룸")
        age = now - lead.published_at
        if age <= timedelta(hours=24):
            score += 2
            reasons.append("최근 24시간 이내 발행")
        elif age <= timedelta(hours=48):
            score += 1
        if matched:
            ranked.append(Ranked(key=lead.key, score=score, reasons=reasons))
    ranked.sort(key=lambda item: item.score, reverse=True)
    return ranked[:limit]

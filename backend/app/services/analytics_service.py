"""Anonymous usage counts for the savings journey, from users who opted in.

The funnel is read from daily totals only, so a "conversion" is the ratio of step counts over a period,
not the path of any one person (nothing links one event to another).
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models.analytics import AnalyticsDailyCount

# (event, label, part of the savings funnel)
EVENTS: list[tuple[str, str, bool]] = [
    ("visit_conditions", "내 조건 입력 화면", True),
    ("visit_banks", "은행 비교 화면", True),
    ("visit_cashflow", "납입 계획 화면", True),
    ("check_month_impact", "한 달 변경 영향 계산", True),
    ("visit_maturity", "만기 후 계획 화면", True),
    ("plan_maturity", "만기 후 선택지 계산", True),
    ("download_reminder", "만기 알림 캘린더 받기", True),
    ("visit_daily", "오늘의 머니 화면", False),
    ("visit_market", "시장 지표 화면", False),
    ("visit_alternatives", "대안 비교 화면", False),
    ("visit_my_savings", "내 적금 화면", False),
    ("visit_general_savings", "일반 적금 비교 화면", False),
    ("visit_rent_loans", "전세대출 비교 화면", False),
    ("visit_terms", "쉬운 용어 풀이 화면", False),
    ("share_result", "은행 비교 결과 공유", False),
    ("open_shared", "공유받은 결과 열기", False),
]
EVENT_NAMES = {name for name, _, _ in EVENTS}


class AnalyticsService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def record(self, event: str, day: date) -> None:
        if event not in EVENT_NAMES:
            raise ValueError(f"모르는 이벤트입니다: {event}")
        row = self.session.scalar(select(AnalyticsDailyCount).where(AnalyticsDailyCount.day == day, AnalyticsDailyCount.event == event))
        if row is None:
            self.session.add(AnalyticsDailyCount(day=day, event=event, count=1))
        else:
            row.count += 1
        self.session.commit()

    def funnel(self, today: date, days: int) -> dict[str, object]:
        start = today - timedelta(days=days - 1)
        totals = dict(self.session.execute(
            select(AnalyticsDailyCount.event, func.sum(AnalyticsDailyCount.count))
            .where(AnalyticsDailyCount.day >= start, AnalyticsDailyCount.day <= today)
            .group_by(AnalyticsDailyCount.event)
        ).all())
        first = int(totals.get(EVENTS[0][0], 0) or 0)
        steps = []
        for name, label, in_funnel in EVENTS:
            count = int(totals.get(name, 0) or 0)
            steps.append({
                "event": name, "label": label, "inFunnel": in_funnel, "count": count,
                "ofFirstStepPercent": round(count / first * 100, 1) if in_funnel and first else None,
            })
        return {"start": start.isoformat(), "end": today.isoformat(), "steps": steps}

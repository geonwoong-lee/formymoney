from datetime import datetime, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.collectors.ecos import SERIES, SERIES_BY_CODE
from app.models.market import MarketPoint
from app.schemas.market import MarketGroupResponse, MarketItemResponse, MarketResponse, RateTrendPoint

SOURCE_NAME = "한국은행 경제통계시스템(ECOS)"
SOURCE_URL = "https://ecos.bok.or.kr/"
TREND_MONTHS = 24
GROUPS = [
    ("fx", "환율", "은행 간 매매기준율이며 하루 한 번 갱신합니다. 실제 환전 가격과 다릅니다."),
    ("kr_stock", "국내 증시", "전 영업일 종가입니다. 실시간 시세가 아닙니다."),
    ("rate", "금리", "기준금리·국고채는 일별, 예금 평균금리는 월별 통계입니다."),
    ("world_stock", "해외 주요국 주가지수", "월간 통계이며 2015년을 100으로 환산한 값이라 실제 지수 숫자와 다릅니다."),
]


class MarketService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save(self, series_code: str, points: list[tuple[str, Decimal]], now: datetime | None = None) -> int:
        fetched_at = now or datetime.now(timezone.utc)
        existing = {
            row.period: row
            for row in self.session.scalars(select(MarketPoint).where(
                MarketPoint.series_code == series_code, MarketPoint.period.in_([period for period, _ in points])
            ))
        }
        changed = 0
        for period, value in points:
            row = existing.get(period)
            if row is None:
                row = MarketPoint(series_code=series_code, period=period, value=value, fetched_at=fetched_at)
                self.session.add(row)
                existing[period] = row
                changed += 1
            else:
                if Decimal(row.value) != value:  # ECOS revises recent values occasionally
                    row.value = value
                    changed += 1
                row.fetched_at = fetched_at  # so "last collected" reflects every run
        self.session.commit()
        return changed

    def _latest(self, series_code: str, count: int) -> list[MarketPoint]:
        return list(self.session.scalars(
            select(MarketPoint).where(MarketPoint.series_code == series_code)
            .order_by(MarketPoint.period.desc()).limit(count)
        ))

    def _item(self, series_code: str) -> MarketItemResponse | None:
        series = SERIES_BY_CODE[series_code]
        rows = self._latest(series_code, 2)
        if not rows:
            return None
        latest = Decimal(rows[0].value)
        item = MarketItemResponse(
            code=series.code, name=series.name, unit=series.unit, cycle=series.cycle,
            period=rows[0].period, value=latest,
        )
        if len(rows) == 2:
            previous = Decimal(rows[1].value)
            item.previous_period = rows[1].period
            item.change = latest - previous
            item.change_percent = ((latest - previous) / previous * 100).quantize(Decimal("0.01")) if previous else None
        return item

    def rate_trend(self) -> list[RateTrendPoint]:
        by_period: dict[str, RateTrendPoint] = {}
        for code, field in (("base_rate_monthly", "base_rate"), ("deposit_rate", "deposit_rate")):
            for row in self._latest(code, TREND_MONTHS):
                point = by_period.setdefault(row.period, RateTrendPoint(period=row.period))
                setattr(point, field, Decimal(row.value))
        if not by_period:
            return []
        # Every month between the first and last one is returned, so a month with no data at all stays visible as a gap.
        last = sorted(by_period)[-1]
        end = int(last[:4]) * 12 + int(last[4:]) - 1
        months = [f"{index // 12}{index % 12 + 1:02d}" for index in range(end - TREND_MONTHS + 1, end + 1)]
        first = sorted(by_period)[0]
        return [by_period.get(month, RateTrendPoint(period=month)) for month in months if month >= first]

    def snapshot(self) -> MarketResponse:
        groups = []
        for key, title, note in GROUPS:
            items = [item for series in SERIES if series.group == key if (item := self._item(series.code))]
            if items:
                groups.append(MarketGroupResponse(key=key, title=title, note=note, items=items))
        updated_at = self.session.scalar(select(func.max(MarketPoint.fetched_at)))
        return MarketResponse(
            groups=groups, rate_trend=self.rate_trend(), source_name=SOURCE_NAME, source_url=SOURCE_URL,
            updated_at=updated_at,
        )

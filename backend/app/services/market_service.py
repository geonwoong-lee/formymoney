from datetime import datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.collectors.ecos import SERIES, SERIES_BY_CODE
from app.models.market import MarketPoint
from app.schemas.market import MarketGroupResponse, MarketItemResponse, MarketResponse, RateContext, RateTrendPoint

SOURCE_NAME = "한국은행 경제통계시스템(ECOS)"
SOURCE_URL = "https://ecos.bok.or.kr/"
TREND_MONTHS = 24
GROUPS = [
    ("fx", "환율", "은행 간 매매기준율이며 하루 한 번 갱신합니다. 실제 환전 가격과 다릅니다."),
    ("kr_stock", "국내 증시", "전 영업일 종가입니다. 실시간 시세가 아닙니다."),
    ("rate", "금리", "기준금리·국고채는 일별, 예금 평균금리는 월별 통계입니다."),
    ("world_stock", "해외 주요국 주가지수", "월간 통계이며 2015년을 100으로 환산한 값이라 실제 지수 숫자와 다릅니다."),
    ("price", "물가", "국가데이터처 소비자물가지수(2020=100)를 한국은행 ECOS에서 받아 전년 같은 달과 비교해 계산한 값입니다. 공식 발표 수치와 0.1%p 안팎의 반올림 차이가 날 수 있습니다."),
]
NEW_DAYS = 3
CPI_CODE = "cpi_yoy"
CPI_NAME = "소비자물가 상승률(전년 같은 달 대비)"


def _month_before(period: str, months: int) -> str:
    index = int(period[:4]) * 12 + int(period[4:6]) - 1 - months
    return f"{index // 12}{index % 12 + 1:02d}"


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
        # The very first fill of a series is a backfill of past months, not news: leave first_seen_at empty.
        backfill = self.session.scalar(select(MarketPoint.id).where(MarketPoint.series_code == series_code).limit(1)) is None
        changed = 0
        for period, value in points:
            row = existing.get(period)
            if row is None:
                row = MarketPoint(
                    series_code=series_code, period=period, value=value, fetched_at=fetched_at,
                    first_seen_at=None if backfill else fetched_at,
                )
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
        item.is_new = self._is_new(rows[0])
        return item

    @staticmethod
    def _is_new(row: MarketPoint, now: datetime | None = None) -> bool:
        if row.first_seen_at is None:
            return False
        seen = row.first_seen_at if row.first_seen_at.tzinfo else row.first_seen_at.replace(tzinfo=timezone.utc)
        return (now or datetime.now(timezone.utc)) - seen <= timedelta(days=NEW_DAYS)

    def _cpi_yoy(self) -> dict[str, Decimal]:
        """Year-on-year CPI rise by month, rounded to 0.1 like the official release."""
        index = {row.period: Decimal(row.value) for row in self._latest("cpi_index", 40)}
        rises = {}
        for period, value in index.items():
            base = index.get(_month_before(period, 12))
            if base:
                rises[period] = ((value / base - 1) * 100).quantize(Decimal("0.1"), rounding=ROUND_HALF_UP)
        return rises

    def _cpi_item(self) -> MarketItemResponse | None:
        rises = self._cpi_yoy()
        if not rises:
            return None
        latest = max(rises)
        item = MarketItemResponse(code=CPI_CODE, name=CPI_NAME, unit="%", cycle="M", period=latest, value=rises[latest])
        previous = _month_before(latest, 1)
        if previous in rises:
            item.previous_period = previous
            item.change = rises[latest] - rises[previous]
        newest = self._latest("cpi_index", 1)
        item.is_new = bool(newest) and newest[0].period == latest and self._is_new(newest[0])
        return item

    def rate_context(self) -> RateContext:
        """The latest base rate, average new-deposit rate and consumer price rise, as collected from ECOS."""
        context = RateContext()
        base = self._latest("base_rate", 1)
        if base:
            context.base_rate, context.base_rate_period = Decimal(base[0].value), base[0].period
        deposit = self._latest("deposit_rate", 1)
        if deposit:
            context.deposit_average, context.deposit_average_period = Decimal(deposit[0].value), deposit[0].period
        rises = self._cpi_yoy()
        if rises:
            context.inflation_period = max(rises)
            context.inflation = rises[context.inflation_period]
        return context

    def rate_trend(self) -> list[RateTrendPoint]:
        by_period: dict[str, RateTrendPoint] = {}
        for code, field in (("base_rate_monthly", "base_rate"), ("deposit_rate", "deposit_rate")):
            for row in self._latest(code, TREND_MONTHS):
                point = by_period.setdefault(row.period, RateTrendPoint(period=row.period))
                setattr(point, field, Decimal(row.value))
        for period, rise in self._cpi_yoy().items():
            by_period.setdefault(period, RateTrendPoint(period=period)).cpi_yoy = rise
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
            if key == "price":
                items = [item] if (item := self._cpi_item()) else []
            else:
                items = [item for series in SERIES if series.group == key if (item := self._item(series.code))]
            if items:
                groups.append(MarketGroupResponse(key=key, title=title, note=note, items=items))
        updated_at = self.session.scalar(select(func.max(MarketPoint.fetched_at)))
        return MarketResponse(
            groups=groups, rate_trend=self.rate_trend(), source_name=SOURCE_NAME, source_url=SOURCE_URL,
            updated_at=updated_at,
        )

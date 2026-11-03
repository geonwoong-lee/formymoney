from datetime import datetime
from decimal import Decimal

from app.schemas.daily_briefing import CamelModel


class MarketItemResponse(CamelModel):
    code: str
    name: str
    unit: str
    cycle: str
    period: str
    value: Decimal
    previous_period: str | None = None
    change: Decimal | None = None
    change_percent: Decimal | None = None
    is_new: bool = False  # the latest period first arrived within the last few days


class MarketGroupResponse(CamelModel):
    key: str
    title: str
    note: str
    items: list[MarketItemResponse]


class RateTrendPoint(CamelModel):
    period: str
    base_rate: Decimal | None = None
    deposit_rate: Decimal | None = None
    cpi_yoy: Decimal | None = None


class MarketResponse(CamelModel):
    groups: list[MarketGroupResponse]
    rate_trend: list[RateTrendPoint]
    source_name: str
    source_url: str
    updated_at: datetime | None = None


class RateContext(CamelModel):
    """Official figures to read the listed rates against; each one is left out when it has not been collected."""

    base_rate: Decimal | None = None
    base_rate_period: str | None = None
    deposit_average: Decimal | None = None
    deposit_average_period: str | None = None
    inflation: Decimal | None = None
    inflation_period: str | None = None

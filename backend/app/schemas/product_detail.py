from datetime import date
from decimal import Decimal

from app.schemas.daily_briefing import CamelModel


class RatePointOut(CamelModel):
    day: date
    base_rate: Decimal | None
    max_rate: Decimal | None


class ProductOption(CamelModel):
    term_months: int
    rate_type: str
    reserve_type: str
    disclosed_month: str
    history: list[RatePointOut]  # oldest first, one point per collected day


class ProductTerms(CamelModel):
    join_way: str
    join_member: str
    join_limit: str
    special_conditions: str
    max_limit: int | None
    etc_note: str
    maturity_interest: str


class ProductDetailResponse(CamelModel):
    kind: str
    company: str
    product_code: str
    product_name: str
    group: str
    first_day: date
    last_day: date
    days_collected: int
    terms: ProductTerms | None
    options: list[ProductOption]
    notes: list[str]
    source_name: str
    source_url: str

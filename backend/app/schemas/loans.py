from decimal import Decimal
from typing import Literal

from pydantic import Field

from app.schemas.daily_briefing import CamelModel


class LoanProductsRequest(CamelModel):
    principal: int = Field(ge=1_000_000, le=3_000_000_000)
    months: int = Field(ge=6, le=120)
    group: Literal["bank", "savings_bank"] = "bank"
    repay: Literal["all", "interest_only", "instalment"] = "all"
    rate_type: Literal["all", "fixed", "variable"] = "all"


class LoanProductRow(CamelModel):
    company: str
    product_code: str
    product_name: str
    repay_type: str
    rate_type: str
    rate_min: Decimal
    rate_max: Decimal
    monthly_label: str  # 월 이자 / 월 상환액
    monthly_min: int
    monthly_max: int
    total_interest_min: int
    total_interest_max: int
    loan_limit: str
    early_repay_fee: str
    delay_rate: str
    join_way: str
    disclosed_month: str


class LoanProductsResponse(CamelModel):
    principal: int
    months: int
    group: str
    day: str | None
    count: int
    products: list[LoanProductRow]
    notes: list[str]
    source_name: str
    source_url: str

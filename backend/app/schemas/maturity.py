from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.daily_briefing import CamelModel
from app.schemas.market import RateContext

Profile = Literal["stable", "balanced", "aggressive"]


class MaturityMix(CamelModel):
    asset_code: str = Field(min_length=1, max_length=30)
    deposit_share: int = Field(ge=0, le=100, multiple_of=10)


class MaturityPlanRequest(CamelModel):
    amount: int = Field(ge=100_000, le=1_000_000_000)
    months: Literal[12, 24]
    profile: Profile
    mix: MaturityMix | None = None


class DepositOutcome(CamelModel):
    rate_percent: Decimal
    rate_period: str
    interest: int
    tax: int
    ending_value: int
    ending_value_after_tax: int


class HoldingOutcome(CamelModel):
    windows: int
    first_start: str
    last_start: str
    average_percent: Decimal
    best_percent: Decimal
    worst_percent: Decimal
    loss_windows: int
    average_value: int
    best_value: int
    worst_value: int


class MaturityOption(CamelModel):
    code: str
    name: str
    kind: Literal["deposit", "bond", "dividend", "index", "leveraged"]
    risk_level: int  # 0 = principal protected, 4 = leveraged
    risk_label: str
    principal_protected: bool
    fits_profile: bool
    summary: str
    warning: str
    deposit: DepositOutcome | None = None
    history: HoldingOutcome | None = None
    source_name: str
    source_url: str


class MixOutcome(CamelModel):
    asset_code: str
    asset_name: str
    deposit_share: int
    history: HoldingOutcome


class MaturityPlanResponse(CamelModel):
    amount: int
    months: int
    profile: Profile
    data_start: str
    data_end: str
    options: list[MaturityOption]
    mix: MixOutcome | None = None
    notes: list[str]
    checked_on: date


RATE_STEPS = (Decimal("0.25"), Decimal("0.5"), Decimal("1"))


class RateScenarioRequest(CamelModel):
    monthly_amount: int = Field(ge=10_000, le=10_000_000)
    months: Literal[6, 12, 24, 36]
    rate_percent: Decimal = Field(ge=0, le=20, decimal_places=2)
    step: Decimal

    @field_validator("step")
    @classmethod
    def known_step(cls, value: Decimal) -> Decimal:
        if value not in RATE_STEPS:
            raise ValueError("변화 폭은 0.25, 0.5, 1%p 중 하나여야 합니다.")
        return value


class RateScenarioCase(CamelModel):
    key: Literal["up", "same", "down"]
    rate_percent: Decimal
    principal: int
    interest: int
    tax: int
    after_tax: int
    difference_from_same: int


class RateScenarioResponse(CamelModel):
    monthly_amount: int
    months: int
    step: Decimal
    cases: list[RateScenarioCase]


class DepositProductsRequest(CamelModel):
    amount: int = Field(ge=100_000, le=1_000_000_000)
    months: Literal[12, 24]
    group: Literal["bank", "savings_bank"] = "bank"


class DepositProductRow(CamelModel):
    company: str
    product_code: str = ""
    reserve_type: str = ""  # savings only: 정액적립식 / 자유적립식
    product_name: str
    rate_type: str
    base_rate: Decimal
    max_rate: Decimal | None
    base_after_tax: int
    max_after_tax: int | None
    # Joining terms from the disclosure; empty when the product's terms were not collected.
    join_way: str = ""
    join_member: str = ""
    join_limit: str = ""
    special_conditions: str = ""
    max_limit: int | None = None
    over_limit: bool = False
    etc_note: str = ""
    maturity_interest: str = ""


class DepositRatePoint(CamelModel):
    rate_percent: Decimal
    after_tax: int


class DepositProductsResponse(CamelModel):
    amount: int
    months: int
    group: str
    day: date | None
    count: int
    principal: int | None = None  # savings only: what the person pays in over the term
    lowest: DepositRatePoint | None
    middle: DepositRatePoint | None
    highest: DepositRatePoint | None
    products: list[DepositProductRow]
    notes: list[str]
    source_name: str
    source_url: str
    context: RateContext | None = None


class SavingProductsRequest(CamelModel):
    monthly_amount: int = Field(ge=10_000, le=5_000_000)
    months: Literal[6, 12, 24, 36]
    group: Literal["bank", "savings_bank"] = "bank"
    reserve: Literal["all", "fixed", "free"] = "all"

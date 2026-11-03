from datetime import datetime
from typing import Literal

from pydantic import Field, field_validator

from app.schemas.daily_briefing import CamelModel

MONTH_PATTERN = r"^\d{4}-(0[1-9]|1[0-2])$"
CODE_PATTERN = r"^[A-Za-z0-9_-]{1,60}$"


class DraftPlan(CamelModel):
    enrollment_status: Literal["considering", "enrolled"] | None = None
    monthly_amount: int | None = Field(default=None, ge=0, le=10_000_000)
    start_month: str | None = Field(default=None, pattern=MONTH_PATTERN)
    transition_status: Literal["yes", "no", "unknown"] | None = None
    contribution_type: Literal["none", "general", "preferred"] | None = None
    current_bank_code: str | None = Field(default=None, pattern=CODE_PATTERN)


class Draft(CamelModel):
    """The same shape the browser keeps (very-rich:draft:v1); nothing else is accepted."""

    version: Literal[1]
    plan: DraftPlan
    conditions: dict[str, Literal["yes", "no", "unknown"]] = Field(default_factory=dict, max_length=200)
    monthly_payments: dict[str, int] = Field(default_factory=dict, max_length=120)

    @field_validator("conditions")
    @classmethod
    def known_condition_keys(cls, value: dict[str, str]) -> dict[str, str]:
        if any(len(key) > 120 for key in value):
            raise ValueError("조건 이름이 너무 깁니다.")
        return value

    @field_validator("monthly_payments")
    @classmethod
    def payment_amounts(cls, value: dict[str, int]) -> dict[str, int]:
        if any(len(key) > 20 or not 0 <= amount <= 10_000_000 for key, amount in value.items()):
            raise ValueError("월별 납입액이 올바르지 않습니다.")
        return value


class SavedPlanRequest(CamelModel):
    name: str = Field(min_length=1, max_length=40)
    draft: Draft

    @field_validator("name")
    @classmethod
    def trimmed(cls, value: str) -> str:
        value = " ".join(value.split())
        if not value:
            raise ValueError("이름을 입력해 주세요.")
        return value


class SavedPlanResponse(CamelModel):
    id: int
    name: str
    draft: Draft
    created_at: datetime
    updated_at: datetime


class SavedPlansResponse(CamelModel):
    plans: list[SavedPlanResponse]
    limit: int


WATCHLIST_LIMIT = 30


class WatchedProduct(CamelModel):
    kind: Literal["deposit", "saving"]
    company: str = Field(min_length=1, max_length=100)
    product_code: str = Field(min_length=1, max_length=60)
    product_name: str = Field(min_length=1, max_length=200)


class WatchlistRequest(CamelModel):
    items: list[WatchedProduct] = Field(max_length=WATCHLIST_LIMIT)


class WatchlistResponse(CamelModel):
    items: list[WatchedProduct]
    updated_at: datetime | None = None
    limit: int = WATCHLIST_LIMIT

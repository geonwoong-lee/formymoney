from typing import Literal

from pydantic import Field

from app.schemas.daily_briefing import CamelModel


class WatchedItem(CamelModel):
    kind: Literal["deposit", "saving"]
    company: str = Field(min_length=1, max_length=100)
    product_code: str = Field(min_length=1, max_length=60)


class AssistantProfile(CamelModel):
    """What the visitor typed into 내 조건 and 월별 납입 계획, sent with one question so 머니독 can answer about their own plan.

    It lives in the browser; the server reads it for this answer only and keeps nothing.
    """

    bank_code: str | None = Field(default=None, max_length=30)
    monthly_amount: int | None = Field(default=None, ge=0, le=5_000_000)
    contribution_type: Literal["none", "general", "preferred"] | None = None
    start_month: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}$")
    enrollment_status: Literal["considering", "enrolled"] | None = None
    # "<bank code or common>:<condition code>" -> the visitor's answer
    conditions: dict[str, Literal["yes", "no", "unknown"]] = Field(default_factory=dict, max_length=80)
    # "1".."36" (the nth month of the plan) -> the amount planned or paid that month
    payments: dict[str, int] = Field(default_factory=dict, max_length=60)
    # Products the visitor starred; the list only says which ones to look at.
    watch: list[WatchedItem] = Field(default_factory=list, max_length=30)

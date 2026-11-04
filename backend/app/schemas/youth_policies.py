from typing import Literal

from pydantic import Field

from app.schemas.daily_briefing import CamelModel


class YouthPoliciesRequest(CamelModel):
    keyword: str = Field(default="", max_length=50)
    category: str = Field(default="", max_length=30)
    region: str = Field(default="", max_length=2)  # 시도 prefix such as "11", "" for any
    age: int | None = Field(default=None, ge=0, le=120)  # only used to filter, never stored
    open_only: bool = True
    sort: Literal["deadline", "recent"] = "deadline"
    offset: int = Field(default=0, ge=0, le=5000)
    limit: int = Field(default=20, ge=1, le=200)


class YouthPolicyRow(CamelModel):
    policy_no: str
    name: str
    keywords: list[str]
    summary: str
    support: str
    category: str
    age_label: str  # "" when the policy lists no age limit
    income_note: str
    extra_conditions: str
    apply_label: str
    apply_end: str | None
    apply_method: str
    selection: str
    institution: str
    apply_url: str
    ref_url: str
    region_label: str
    modified_on: str | None


class RegionOption(CamelModel):
    code: str
    name: str


class YouthPoliciesResponse(CamelModel):
    day: str | None
    total: int  # every stored policy
    count: int  # policies that match the filters
    offset: int
    policies: list[YouthPolicyRow]
    categories: list[str]
    regions: list[RegionOption]
    notes: list[str]
    source_name: str
    source_url: str

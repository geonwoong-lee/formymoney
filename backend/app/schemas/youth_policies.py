from typing import Literal

from pydantic import Field

from app.schemas.daily_briefing import CamelModel


class YouthPoliciesRequest(CamelModel):
    keyword: str = Field(default="", max_length=50)
    category: str = Field(default="", max_length=30)
    region: str = Field(default="", max_length=2)  # 시도 prefix such as "11", "" for any
    age: int | None = Field(default=None, ge=0, le=120)  # only used to filter, never stored
    # 내 상황(선택). 온통청년 코드 그대로 받고, 거르는 데만 쓰며 저장하지 않는다.
    job: str = Field(default="", pattern=r"^(0013\d{3})?$")
    marriage: str = Field(default="", pattern=r"^(0055\d{3})?$")
    school: str = Field(default="", pattern=r"^(0049\d{3})?$")
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
    fit: list[str] = []  # 고른 내 상황에 맞는 이유(나이·지역·취업 상태·결혼·학력)
    to_check: list[str] = []  # 이 사이트가 판정하지 않는, 신청 전에 확인할 조건


class RegionOption(CamelModel):
    code: str
    name: str


class ProfileOptions(CamelModel):
    jobs: list[RegionOption]
    marriages: list[RegionOption]
    schools: list[RegionOption]


class YouthPoliciesResponse(CamelModel):
    day: str | None
    total: int  # every stored policy
    count: int  # policies that match the filters
    offset: int
    policies: list[YouthPolicyRow]
    categories: list[str]
    regions: list[RegionOption]
    notes: list[str]
    profile_options: ProfileOptions
    conditions_collected: bool  # 취업 상태·결혼·학력 코드를 모은 정책이 있는지. False면 이 조건으로는 거르지 못한다
    source_name: str
    source_url: str

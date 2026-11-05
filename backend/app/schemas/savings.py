from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.health import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class Answer(str, Enum):
    yes = "yes"
    no = "no"
    unknown = "unknown"


class ContributionType(str, Enum):
    none = "none"
    general = "general"
    preferred = "preferred"


class CalculationRequest(CamelModel):
    monthly_amount: int = Field(ge=1_000, le=500_000)
    contribution_type: ContributionType
    condition_answers: dict[str, dict[str, Answer]] = Field(default_factory=dict)
    bank_codes: list[str] | None = None
    current_bank_code: str | None = None

    @field_validator("bank_codes")
    @classmethod
    def bank_codes_must_not_be_empty(cls, value: list[str] | None) -> list[str] | None:
        if value == []:
            raise ValueError("bank_codes cannot be empty")
        return value


class ConditionResponse(CamelModel):
    code: str
    title: str
    bonus_rate: float
    description: str
    question: str
    requires_additional_review: bool


class ProductResponse(CamelModel):
    bank_code: str
    bank_name: str
    product_name: str
    base_rate: float
    maximum_rate: float
    source_url: str
    source_date: str
    conditions: list[ConditionResponse]


class PolicyResponse(CamelModel):
    code: str
    name: str
    term_months: int
    minimum_monthly_amount: int
    maximum_monthly_amount: int
    annual_limit: int
    general_contribution_rate: float
    preferred_contribution_rate: float
    tax_exempt: bool
    source_url: str
    source_date: str


class ProductsResponse(CamelModel):
    policy: PolicyResponse
    products: list[ProductResponse]


class ConditionResult(CamelModel):
    code: str
    title: str
    answer: Answer
    status: str
    bonus_rate: float
    applied_bonus_rate: float
    reason: str


class BankCalculationResult(CamelModel):
    bank_code: str
    bank_name: str
    product_name: str
    base_rate: float
    maximum_rate: float
    applied_bonus_rate: float
    expected_rate: float
    principal: int
    deposit_interest: int
    government_contribution: int
    government_contribution_interest: int
    expected_maturity_amount: int
    difference_from_current_bank: int | None
    conditions: list[ConditionResult]
    source_url: str
    source_date: str


class CalculationResponse(CamelModel):
    monthly_amount: int
    term_months: int
    contribution_type: ContributionType
    tax_exempt: bool
    results: list[BankCalculationResult]


class CashflowCalculationRequest(CamelModel):
    bank_code: str
    monthly_amounts: list[int] = Field(min_length=1)
    fixed_monthly_amount: int = Field(ge=1_000, le=500_000)
    contribution_type: ContributionType
    condition_answers: dict[str, Answer] = Field(default_factory=dict)


class CashflowCalculationResponse(CamelModel):
    bank_code: str
    term_months: int
    monthly_amounts: list[int]
    result: BankCalculationResult
    fixed_expected_maturity_amount: int
    difference_from_fixed_plan: int


class MonthImpactRequest(CamelModel):
    bank_code: str
    monthly_amounts: list[int] = Field(min_length=1)
    fixed_monthly_amount: int = Field(ge=1_000, le=500_000)
    contribution_type: ContributionType
    condition_answers: dict[str, Answer] = Field(default_factory=dict)
    month_number: int = Field(ge=1, description="영향을 볼 납입 회차(1부터)")
    reduced_amount: int = Field(ge=1_000, description="감액 시나리오에서 그 달에 넣을 금액")


class MonthImpactScenario(CamelModel):
    key: str
    label: str
    month_amount: int
    principal: int
    deposit_interest: int
    government_contribution: int
    government_contribution_interest: int
    expected_maturity_amount: int
    difference_from_keep: int
    deposit_interest_difference_from_keep: int
    government_contribution_difference_from_keep: int


class MonthImpactResponse(CamelModel):
    bank_code: str
    bank_name: str
    month_number: int
    term_months: int
    expected_rate: float
    scenarios: list[MonthImpactScenario]
    unavailable_notes: list[str]
    source_url: str
    source_date: str


class EarlyExitRequest(CashflowCalculationRequest):
    paid_months: int = Field(ge=1, description="지금까지 낸 회차 수. 이 회차까지 내고 해지한다고 본다")


class EarlyExitTermination(CamelModel):
    """일반 중도해지로 지금 받는 돈의 참고값. 은행별 중도해지 이율 대신 기본금리를 그대로 적용한다."""
    principal: int
    interest_at_base_rate: int
    interest_tax: int
    received_at_base_rate: int
    lost_government_contribution: int


class EarlyExitScenario(CamelModel):
    # keep: 원래 계획대로, pause: 남은 달 쉬고 만기까지 두기, minimum: 남은 달 최소 금액만 넣기
    key: Literal["keep", "pause", "minimum"]
    label: str
    future_monthly_amount: int | None  # keep은 계획표의 금액이 달마다 달라 None
    principal: int
    deposit_interest: int
    government_contribution: int
    government_contribution_interest: int
    expected_maturity_amount: int
    extra_principal: int  # 지금까지 낸 원금보다 더 넣게 되는 원금
    more_than_termination: int  # 이 선택의 만기 수령액 - 지금 해지할 때 받는 돈의 참고값


class EarlyExitResponse(CamelModel):
    bank_code: str
    bank_name: str
    paid_months: int
    term_months: int
    months_left: int
    base_rate: float
    expected_rate: float
    interest_tax_rate: float
    termination: EarlyExitTermination
    scenarios: list[EarlyExitScenario]
    special_termination_reasons: list[str]
    special_termination_source: str  # 사유 목록을 확인한 곳(가입 은행이 아닐 수 있음)
    special_termination_source_url: str
    special_termination_source_date: str
    unavailable_notes: list[str]
    source_url: str
    source_date: str


class MyStatusRequest(CashflowCalculationRequest):
    start_month: str | None = Field(default=None, pattern=r"^\d{4}-(0[1-9]|1[0-2])$")
    enrolled: bool = False


class MyTimeline(CamelModel):
    # before_start: 가입 전·첫 달 전, saving: 납입 중, matured: 만기 지남, unknown: 가입월을 모름
    phase: Literal["before_start", "saving", "matured", "unknown"]
    start_month: str | None
    maturity_month: str | None
    current_round: int | None  # 이번 달이 몇 회차인지(1부터), 납입 중일 때만
    term_months: int
    months_to_maturity: int | None


class MyPayments(CamelModel):
    # Rounds up to and including this month; only counted for someone who has joined and gave a start month.
    paid_rounds: int
    paid_amount: int
    remaining_rounds: int
    remaining_amount: int
    skipped_rounds: list[int]
    reduced_rounds: list[int]


class ConditionImpact(CamelModel):
    code: str
    # The expected maturity amount if this one condition is never met (the bonus rate applies to the whole term).
    maturity_amount: int
    loss: int


class MyConditions(CamelModel):
    applied: list[ConditionResult]
    not_applied: list[ConditionResult]
    needs_check: list[ConditionResult]
    # If every condition answered "모름" turned out to be met: the expected maturity amount and the gain.
    if_checked_maturity_amount: int | None
    if_checked_gain: int | None
    impacts: list[ConditionImpact] = []


class MyStatusResponse(CamelModel):
    timeline: MyTimeline
    payments: MyPayments
    cashflow: CashflowCalculationResponse
    conditions: MyConditions

from enum import Enum

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

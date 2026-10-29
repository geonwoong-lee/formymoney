from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.health import to_camel
from app.schemas.savings import Answer, ContributionType


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ComparisonRequest(CamelModel):
    bank_code: str
    monthly_amounts: list[int] = Field(min_length=1)
    fixed_monthly_amount: int = Field(ge=1_000, le=500_000)
    contribution_type: ContributionType
    condition_answers: dict[str, Answer] = Field(default_factory=dict)
    asset_codes: list[str]

    @field_validator("asset_codes")
    @classmethod
    def asset_codes_must_not_be_empty(cls, value: list[str]) -> list[str]:
        if not value or len(value) > 5:
            raise ValueError("asset_codes must contain between one and five items")
        return value


class ComparisonResult(CamelModel):
    kind: str
    code: str
    name: str
    ticker: str | None
    principal: int
    ending_value: int
    profit_loss: int
    return_percent: float
    max_drawdown_percent: float | None
    leveraged: bool
    warning: str
    source_url: str
    source_date: str
    tax_treatment: str
    fee_treatment: str
    fx_treatment: str


class ComparisonResponse(CamelModel):
    start_month: str
    end_month: str
    monthly_amounts: list[int]
    results: list[ComparisonResult]
    historical_scenario: bool
    dividends_reinvested: bool
    notice: str

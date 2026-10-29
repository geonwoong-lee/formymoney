from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.health import to_camel


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class InvestmentAssetResponse(CamelModel):
    code: str
    ticker: str
    name: str
    category: str
    currency: str
    benchmark: str
    leveraged: bool
    expense_ratio_percent: float
    distribution_policy: str
    provider_source_url: str
    price_source_url: str
    fx_source_url: str
    source_date: str
    warning: str
    start_month: str
    end_month: str
    available_months: int


class InvestmentAssetsResponse(CamelModel):
    assets: list[InvestmentAssetResponse]
    tax_included: bool
    trading_fee_included: bool
    fx_included: bool
    fractional_shares: bool


class InvestmentCalculationRequest(CamelModel):
    monthly_amounts: list[int] = Field(min_length=1)
    asset_codes: list[str] | None = None

    @field_validator("asset_codes")
    @classmethod
    def asset_codes_must_not_be_empty(cls, value: list[str] | None) -> list[str] | None:
        if value == []:
            raise ValueError("asset_codes cannot be empty")
        return value


class InvestmentCalculationResult(CamelModel):
    asset: InvestmentAssetResponse
    principal: int
    ending_value: int
    profit_loss: int
    return_percent: float
    purchased_shares: float
    max_drawdown_percent: float


class InvestmentCalculationResponse(CamelModel):
    start_month: str
    end_month: str
    monthly_amounts: list[int]
    results: list[InvestmentCalculationResult]
    tax_included: bool
    trading_fee_included: bool
    fx_included: bool
    dividends_reinvested: bool
    historical_scenario: bool

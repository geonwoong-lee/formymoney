from sqlalchemy.orm import Session

from app.calculators.investment import MarketPoint, calculate_monthly_market_investment
from app.models.investment import InvestmentAsset
from app.repositories.investment_repository import InvestmentRepository
from app.schemas.investment import (
    InvestmentAssetResponse,
    InvestmentAssetsResponse,
    InvestmentCalculationRequest,
    InvestmentCalculationResponse,
    InvestmentCalculationResult,
)


class InvestmentDataError(RuntimeError):
    pass


class InvestmentInputError(ValueError):
    pass


class InvestmentService:
    def __init__(self, session: Session) -> None:
        self.repository = InvestmentRepository(session)

    def get_assets(self) -> InvestmentAssetsResponse:
        assets = self.repository.list_assets()
        if not assets:
            raise InvestmentDataError("투자 기준 데이터를 불러오지 못했습니다.")
        return InvestmentAssetsResponse(
            assets=[self._asset_response(asset) for asset in assets],
            tax_included=False,
            trading_fee_included=False,
            fx_included=True,
            fractional_shares=True,
        )

    def calculate(self, request: InvestmentCalculationRequest) -> InvestmentCalculationResponse:
        assets = self.repository.list_assets()
        if not assets:
            raise InvestmentDataError("투자 기준 데이터를 불러오지 못했습니다.")
        selected_codes = set(request.asset_codes or [asset.code for asset in assets])
        known_codes = {asset.code for asset in assets}
        unknown_codes = selected_codes - known_codes
        if unknown_codes:
            raise InvestmentInputError(f"지원하지 않는 투자 대상입니다: {', '.join(sorted(unknown_codes))}")

        selected_assets = [asset for asset in assets if asset.code in selected_codes]
        expected_months = len(selected_assets[0].points)
        if len(request.monthly_amounts) != expected_months:
            raise InvestmentInputError(f"월별 납입액은 {expected_months}개월분이어야 합니다.")
        if any(amount < 0 or amount > 500_000 or (amount != 0 and amount < 1_000) for amount in request.monthly_amounts):
            raise InvestmentInputError("월별 납입액은 0원 또는 1,000원부터 500,000원 사이여야 합니다.")

        results = []
        for asset in selected_assets:
            if len(asset.points) != expected_months:
                raise InvestmentDataError(f"{asset.ticker}의 월별 데이터가 일부 누락됐습니다.")
            amounts = calculate_monthly_market_investment(
                request.monthly_amounts,
                [MarketPoint(point.adjusted_close, point.usd_krw) for point in asset.points],
            )
            results.append(InvestmentCalculationResult(
                asset=self._asset_response(asset),
                principal=amounts.principal,
                ending_value=amounts.ending_value,
                profit_loss=amounts.profit_loss,
                return_percent=amounts.return_percent,
                purchased_shares=amounts.purchased_shares,
                max_drawdown_percent=amounts.max_drawdown_percent,
            ))
        results.sort(key=lambda item: item.asset.code)
        return InvestmentCalculationResponse(
            start_month=selected_assets[0].points[0].month,
            end_month=selected_assets[0].points[-1].month,
            monthly_amounts=request.monthly_amounts,
            results=results,
            tax_included=False,
            trading_fee_included=False,
            fx_included=True,
            dividends_reinvested=True,
            historical_scenario=True,
        )

    @staticmethod
    def _asset_response(asset: InvestmentAsset) -> InvestmentAssetResponse:
        if not asset.points:
            raise InvestmentDataError(f"{asset.ticker}의 월별 데이터가 없습니다.")
        return InvestmentAssetResponse(
            code=asset.code,
            ticker=asset.ticker,
            name=asset.name,
            category=asset.category,
            currency=asset.currency,
            benchmark=asset.benchmark,
            leveraged=asset.leveraged,
            expense_ratio_percent=asset.expense_ratio_percent,
            distribution_policy=asset.distribution_policy,
            provider_source_url=asset.provider_source_url,
            price_source_url=asset.price_source_url,
            fx_source_url=asset.fx_source_url,
            source_date=asset.source_date,
            warning=asset.warning,
            start_month=asset.points[0].month,
            end_month=asset.points[-1].month,
            available_months=len(asset.points),
        )

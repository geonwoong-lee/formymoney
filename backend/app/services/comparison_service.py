from decimal import Decimal, ROUND_HALF_UP

from sqlalchemy.orm import Session

from app.schemas.comparison import ComparisonRequest, ComparisonResponse, ComparisonResult
from app.schemas.investment import InvestmentCalculationRequest
from app.schemas.savings import CashflowCalculationRequest
from app.services.investment_service import InvestmentService
from app.services.savings_service import SavingsService


class ComparisonService:
    def __init__(self, session: Session) -> None:
        self.savings = SavingsService(session)
        self.investments = InvestmentService(session)

    def calculate(self, request: ComparisonRequest) -> ComparisonResponse:
        savings = self.savings.calculate_cashflow(CashflowCalculationRequest(
            bank_code=request.bank_code,
            monthly_amounts=request.monthly_amounts,
            fixed_monthly_amount=request.fixed_monthly_amount,
            contribution_type=request.contribution_type,
            condition_answers=request.condition_answers,
        ))
        investments = self.investments.calculate(InvestmentCalculationRequest(
            monthly_amounts=request.monthly_amounts,
            asset_codes=request.asset_codes,
        ))

        savings_profit = savings.result.expected_maturity_amount - savings.result.principal
        savings_return = (
            Decimal(savings_profit) / Decimal(savings.result.principal) * Decimal("100")
            if savings.result.principal > 0 else Decimal("0")
        ).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
        results = [ComparisonResult(
            kind="savings",
            code=savings.result.bank_code,
            name=f"{savings.result.bank_name} {savings.result.product_name}",
            ticker=None,
            principal=savings.result.principal,
            ending_value=savings.result.expected_maturity_amount,
            profit_loss=savings_profit,
            return_percent=float(savings_return),
            max_drawdown_percent=None,
            leveraged=False,
            warning="예상금리와 정부기여금을 반영한 만기 예상값이며 실제 수령액은 금융기관 확인이 필요합니다.",
            source_url=savings.result.source_url,
            source_date=savings.result.source_date,
            tax_treatment="청년미래적금 비과세 기준 반영",
            fee_treatment="별도 가입 수수료 없음으로 계산",
            fx_treatment="해당 없음",
        )]
        results.extend(ComparisonResult(
            kind="investment",
            code=item.asset.code,
            name=item.asset.name,
            ticker=item.asset.ticker,
            principal=item.principal,
            ending_value=item.ending_value,
            profit_loss=item.profit_loss,
            return_percent=item.return_percent,
            max_drawdown_percent=item.max_drawdown_percent,
            leveraged=item.asset.leveraged,
            warning=item.asset.warning,
            source_url=item.asset.provider_source_url,
            source_date=item.asset.source_date,
            tax_treatment="개인별 세금 미반영",
            fee_treatment=f"증권사 거래 수수료 미반영 · ETF 보수 {item.asset.expense_ratio_percent}%는 가격에 반영",
            fx_treatment=(
                "원화 자산 · 환율 변환 없음"
                if item.asset.currency == "KRW"
                else "월별 원/달러 환율 반영"
            ),
        ) for item in investments.results)
        return ComparisonResponse(
            start_month=investments.start_month,
            end_month=investments.end_month,
            monthly_amounts=request.monthly_amounts,
            results=results,
            historical_scenario=True,
            dividends_reinvested=True,
            notice=(
                "같은 36개월 납입 순서를 적금 만기 계산과 과거 ETF 시나리오에 각각 적용한 설명 자료입니다. "
                "미래 수익을 예측하거나 특정 상품을 추천하지 않습니다."
            ),
        )

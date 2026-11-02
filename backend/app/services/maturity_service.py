"""After-maturity plan: keep the money in a deposit or move it, laid out by the user's chosen risk profile.

The profile only decides which choices come first and are marked as fitting; every choice stays visible,
nothing is recommended, and investment results are past ranges over every possible start month.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.calculators.maturity import (
    deposit_lump_sum,
    ending_value,
    holding_returns,
    monthly_savings_interest,
    summarize,
)
from app.models.investment import InvestmentAsset
from app.models.market import MarketPoint
from app.schemas.maturity import (
    DepositOutcome,
    HoldingOutcome,
    MaturityOption,
    MaturityPlanRequest,
    MaturityPlanResponse,
    MixOutcome,
    RateScenarioCase,
    RateScenarioRequest,
    RateScenarioResponse,
)
from app.services.market_service import SOURCE_NAME as ECOS_NAME, SOURCE_URL as ECOS_URL

CHECKED_ON = date(2026, 11, 2)
DEPOSIT_PROTECTION_LIMIT = 100_000_000
PROFILE_MAX_RISK = {"stable": 1, "balanced": 2, "aggressive": 4}

# kind, risk level (0 protected .. 4 leveraged), risk label, one neutral line about what it is.
ASSET_FACTS: dict[str, tuple[str, int, str, str]] = {
    "bond": ("bond", 1, "낮은 편, 원금 손실 가능", "미국 투자등급 채권에 넓게 나눠 투자하는 ETF예요. 주식보다 덜 움직이는 편이지만 금리가 오르면 값이 내려갈 수 있어요."),
    "schd": ("dividend", 2, "중간, 원금 손실 가능", "미국 배당주를 모아 둔 ETF예요. 배당을 다시 투자한 가격으로 계산했어요."),
    "nasdaq100": ("index", 3, "높음, 원금 손실 가능", "미국 나스닥 상장 큰 기업 100곳의 지수를 따라가는 ETF(QQQ)예요."),
    "kosdaq150": ("index", 3, "높음, 원금 손실 가능", "코스닥 시장 150개 종목 지수를 따라가는 국내 ETF예요. 원화 가격이라 환율 영향이 없어요."),
    "qld": ("leveraged", 4, "매우 높음(레버리지), 큰 손실 가능", "나스닥100 하루 수익률의 2배를 따라가는 레버리지 ETF예요. 오래 들고 있으면 지수 수익의 2배가 되지 않고 손실이 크게 커질 수 있어요."),
}

NOTES = [
    "투자 결과는 2023년 10월부터 2026년 9월까지의 실제 월말 가격으로, 가능한 모든 달에 한 번에 넣었다고 보고 계산한 과거 범위예요. 미래 수익을 예측하거나 보장하지 않아요.",
    "자료가 3년뿐이라 더 길거나 다른 시기에는 결과가 크게 달라질 수 있어요.",
    "세금과 거래 수수료는 반영하지 않았어요. 예금은 이자에 붙는 15.4% 세금을 뗀 금액을 따로 적었어요. 해외 ETF는 원/달러 환율 변화가 들어 있어요.",
    "성향은 선택지를 보여 주는 순서와 묶음만 바꿔요. 어떤 상품에 가입하거나 투자하라고 권하지 않아요.",
]


NO_LOSS_IN_SAMPLE = (
    " 이 3년 동안 같은 기간 들고 있었을 때 손해 본 적이 없었지만, 앞으로도 그렇다는 뜻이 아니에요."
    " 자료가 짧아 주가가 크게 떨어진 시기가 들어 있지 않아요."
)


class MaturityDataError(RuntimeError):
    pass


class MaturityInputError(ValueError):
    pass


def _price_krw(point) -> Decimal:
    return Decimal(point.adjusted_close) * Decimal(point.usd_krw)


def _holding(amount: int, returns: list[Decimal], months_labels: list[str]) -> HoldingOutcome | None:
    summary = summarize(returns, months_labels)
    if summary is None:
        return None
    return HoldingOutcome(
        windows=summary.windows, first_start=summary.first_start, last_start=summary.last_start,
        average_percent=summary.average_percent, best_percent=summary.best_percent, worst_percent=summary.worst_percent,
        loss_windows=summary.loss_windows, average_value=ending_value(amount, summary.average_percent),
        best_value=ending_value(amount, summary.best_percent), worst_value=ending_value(amount, summary.worst_percent),
    )


class MaturityService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _deposit_rate(self) -> MarketPoint:
        row = self.session.scalar(
            select(MarketPoint).where(MarketPoint.series_code == "deposit_rate").order_by(MarketPoint.period.desc()).limit(1)
        )
        if row is None:
            raise MaturityDataError("예금 금리 자료가 아직 없어 계산하지 못했습니다.")
        return row

    def plan(self, request: MaturityPlanRequest) -> MaturityPlanResponse:
        rate_row = self._deposit_rate()
        assets = [asset for asset in self.session.scalars(select(InvestmentAsset).order_by(InvestmentAsset.code)) if asset.code in ASSET_FACTS]
        if not assets or any(not asset.points for asset in assets):
            raise MaturityDataError("투자 기준 데이터를 불러오지 못했습니다.")
        max_risk = PROFILE_MAX_RISK[request.profile]

        rate = Decimal(rate_row.value).quantize(Decimal("0.01"))
        deposit = deposit_lump_sum(request.amount, request.months, rate)
        deposit_warning = f"금리는 은행 예금 평균금리(신규, {rate_row.period[:4]}년 {int(rate_row.period[4:])}월) 기준이며 실제 상품 금리와 다를 수 있어요."
        if request.amount > DEPOSIT_PROTECTION_LIMIT:
            deposit_warning += " 한 금융회사에서는 1인당 원금과 이자를 합쳐 1억 원까지만 예금자보호를 받아요. 넘는 금액은 여러 금융회사에 나눠 맡기면 각각 보호받을 수 있어요."
        options = [MaturityOption(
            code="deposit", name="예금에 다시 맡기기", kind="deposit", risk_level=0, risk_label="원금 보장(예금자보호 한도 안)",
            principal_protected=True, fits_profile=True,
            summary="만기 금액을 은행 정기예금에 다시 맡기는 경우예요. 원금 손실 없이 정해진 이자를 받아요.",
            warning=deposit_warning,
            deposit=DepositOutcome(
                rate_percent=deposit.rate_percent, rate_period=rate_row.period, interest=deposit.interest, tax=deposit.tax,
                ending_value=deposit.ending_value, ending_value_after_tax=deposit.ending_value_after_tax,
            ),
            source_name=ECOS_NAME, source_url=ECOS_URL,
        )]

        returns_by_code: dict[str, list[Decimal]] = {}
        labels = [point.month for point in assets[0].points]
        for asset in assets:
            kind, risk, label, summary = ASSET_FACTS[asset.code]
            if [point.month for point in asset.points] != labels:
                raise MaturityDataError(f"{asset.ticker}의 월별 데이터가 다른 자산과 맞지 않습니다.")
            returns = holding_returns([_price_krw(point) for point in asset.points], request.months)
            returns_by_code[asset.code] = returns
            history = _holding(request.amount, returns, labels)
            # A loss-free sample must not read as "this cannot lose money".
            warning = asset.warning + (NO_LOSS_IN_SAMPLE if history is not None and history.loss_windows == 0 else "")
            options.append(MaturityOption(
                code=asset.code, name=f"{asset.name}({asset.ticker})", kind=kind, risk_level=risk, risk_label=label,
                principal_protected=False, fits_profile=risk <= max_risk, summary=summary, warning=warning,
                history=history, source_name="월말 조정주가와 원/달러 환율", source_url=asset.price_source_url,
            ))
        # Fitting choices first, then lower risk first; nothing is ranked by past return.
        options.sort(key=lambda option: (not option.fits_profile, option.risk_level, option.code))

        mix = None
        if request.mix is not None:
            asset_returns = returns_by_code.get(request.mix.asset_code)
            if asset_returns is None:
                raise MaturityInputError(f"섞어 볼 수 없는 자산입니다: {request.mix.asset_code}")
            share = Decimal(request.mix.deposit_share) / 100
            deposit_percent = Decimal(deposit.interest) / Decimal(request.amount) * 100
            mixed = [share * deposit_percent + (1 - share) * value for value in asset_returns]
            name = next(option.name for option in options if option.code == request.mix.asset_code)
            history = _holding(request.amount, mixed, labels)
            if history is not None:
                mix = MixOutcome(asset_code=request.mix.asset_code, asset_name=name, deposit_share=request.mix.deposit_share, history=history)

        return MaturityPlanResponse(
            amount=request.amount, months=request.months, profile=request.profile,
            data_start=labels[0], data_end=labels[-1], options=options, mix=mix, notes=NOTES, checked_on=CHECKED_ON,
        )


def rate_scenario(request: RateScenarioRequest) -> RateScenarioResponse:
    """Monthly savings at the current rate and at ± step, using the site's savings interest rule and 15.4% tax."""
    def case(key: str, rate: Decimal) -> tuple[str, Decimal, int, int, int]:
        rate = max(Decimal("0"), rate)
        interest = monthly_savings_interest(request.monthly_amount, request.months, rate)
        tax = int(Decimal(interest) * Decimal("0.154"))
        return key, rate, interest, tax, request.monthly_amount * request.months + interest - tax

    rows = [
        case("up", request.rate_percent + request.step),
        case("same", request.rate_percent),
        case("down", request.rate_percent - request.step),
    ]
    same = rows[1][4]
    principal = request.monthly_amount * request.months
    return RateScenarioResponse(
        monthly_amount=request.monthly_amount, months=request.months, step=request.step,
        cases=[RateScenarioCase(
            key=key, rate_percent=rate, principal=principal, interest=interest, tax=tax, after_tax=after,
            difference_from_same=after - same,
        ) for key, rate, interest, tax, after in rows],
    )

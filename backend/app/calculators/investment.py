from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


@dataclass(frozen=True)
class MarketPoint:
    adjusted_close: Decimal
    usd_krw: Decimal


@dataclass(frozen=True)
class InvestmentAmounts:
    principal: int
    ending_value: int
    profit_loss: int
    return_percent: Decimal
    purchased_shares: Decimal
    max_drawdown_percent: Decimal


def calculate_monthly_market_investment(
    monthly_amounts: list[int],
    points: list[MarketPoint],
) -> InvestmentAmounts:
    if len(monthly_amounts) != len(points) or not points:
        raise ValueError("월별 납입액과 시장 데이터의 개수가 같아야 합니다.")

    shares = Decimal("0")
    principal = Decimal(sum(monthly_amounts))
    peak_price_krw = Decimal("0")
    max_drawdown = Decimal("0")

    for monthly_amount, point in zip(monthly_amounts, points, strict=True):
        price_krw = point.adjusted_close * point.usd_krw
        if price_krw <= 0:
            raise ValueError("시장 가격과 환율은 0보다 커야 합니다.")
        shares += Decimal(monthly_amount) / price_krw
        peak_price_krw = max(peak_price_krw, price_krw)
        drawdown = (price_krw / peak_price_krw - Decimal("1")) * Decimal("100")
        max_drawdown = min(max_drawdown, drawdown)

    ending_price_krw = points[-1].adjusted_close * points[-1].usd_krw
    ending_value = shares * ending_price_krw
    profit_loss = ending_value - principal
    return_percent = (
        profit_loss / principal * Decimal("100") if principal > 0 else Decimal("0")
    )

    return InvestmentAmounts(
        principal=_won(principal),
        ending_value=_won(ending_value),
        profit_loss=_won(profit_loss),
        return_percent=return_percent.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
        purchased_shares=shares.quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP),
        max_drawdown_percent=max_drawdown.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP),
    )


def _won(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))

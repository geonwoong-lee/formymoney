"""After-maturity calculations: a lump sum kept in a deposit, or moved into an asset, for a holding period.

Deposits use simple interest on the whole amount (amount × yearly rate × months / 12). Investments use the
stored month-end adjusted prices in won: every possible start month in the data is tried, so the result is a
range of past outcomes (average, best, worst, how often it lost money), never a single forecast.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_DOWN, ROUND_HALF_UP, Decimal

PERCENT = Decimal("100")
MONTHS_IN_YEAR = Decimal("12")
INTEREST_TAX = Decimal("0.154")


def won(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))


@dataclass(frozen=True)
class DepositResult:
    rate_percent: Decimal
    interest: int
    tax: int
    ending_value: int  # before tax, the same basis as the investment results
    ending_value_after_tax: int


def deposit_lump_sum(amount: int, months: int, rate_percent: Decimal) -> DepositResult:
    rate = max(Decimal("0"), rate_percent)
    interest = won(Decimal(amount) * rate / PERCENT * Decimal(months) / MONTHS_IN_YEAR)
    tax = int((Decimal(interest) * INTEREST_TAX).quantize(Decimal("1"), rounding=ROUND_DOWN))
    return DepositResult(rate, interest, tax, amount + interest, amount + interest - tax)


def deposit_lump_sum_compound(amount: int, months: int, rate_percent: Decimal) -> DepositResult:
    """Monthly compounding, the usual basis of a 복리 정기예금: amount × (1 + rate / 12)^months."""
    rate = max(Decimal("0"), rate_percent)
    interest = won(Decimal(amount) * ((1 + rate / PERCENT / MONTHS_IN_YEAR) ** months - 1))
    tax = int((Decimal(interest) * INTEREST_TAX).quantize(Decimal("1"), rounding=ROUND_DOWN))
    return DepositResult(rate, interest, tax, amount + interest, amount + interest - tax)


def monthly_savings_interest(monthly: int, months: int, rate_percent: Decimal) -> int:
    """Same rule as calculators.savings: each deposit earns the rate for the months left (n, n-1, ..., 1)."""
    rate = max(Decimal("0"), rate_percent)
    return won(Decimal(monthly) * rate / PERCENT / MONTHS_IN_YEAR * Decimal(months * (months + 1) // 2))


def monthly_savings_compound_interest(monthly: int, months: int, rate_percent: Decimal) -> int:
    """Each monthly deposit compounds monthly for the months it stays: monthly × (Σ(1+i)^k − months), k = 1..months."""
    rate = max(Decimal("0"), rate_percent)
    if rate == 0 or months <= 0:
        return 0
    i = rate / PERCENT / MONTHS_IN_YEAR
    return won(Decimal(monthly) * ((1 + i) * ((1 + i) ** months - 1) / i - months))


def monthly_savings_after_tax(monthly: int, months: int, rate_percent: Decimal, compound: bool) -> DepositResult:
    """What a fixed monthly deposit pays at the end: principal + interest, and the same after 15.4% interest tax."""
    interest = (monthly_savings_compound_interest if compound else monthly_savings_interest)(monthly, months, rate_percent)
    tax = int((Decimal(interest) * INTEREST_TAX).quantize(Decimal("1"), rounding=ROUND_DOWN))
    principal = monthly * months
    return DepositResult(max(Decimal("0"), rate_percent), interest, tax, principal + interest, principal + interest - tax)


@dataclass(frozen=True)
class HoldingRange:
    windows: int
    average_percent: Decimal
    best_percent: Decimal
    worst_percent: Decimal
    loss_windows: int
    first_start: str
    last_start: str


def holding_returns(prices_krw: list[Decimal], months: int) -> list[Decimal]:
    """Return (%) of buying at each month-end and selling `months` later, for every start that fits."""
    if months <= 0:
        raise ValueError("보유 기간은 1개월 이상이어야 합니다.")
    if any(price <= 0 for price in prices_krw):
        raise ValueError("시장 가격은 0보다 커야 합니다.")
    return [
        (prices_krw[start + months] / prices_krw[start] - 1) * PERCENT
        for start in range(len(prices_krw) - months)
    ]


def summarize(returns: list[Decimal], months_labels: list[str]) -> HoldingRange | None:
    if not returns:
        return None
    quantize = lambda value: value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)  # noqa: E731
    return HoldingRange(
        windows=len(returns),
        average_percent=quantize(sum(returns) / len(returns)),
        best_percent=quantize(max(returns)),
        worst_percent=quantize(min(returns)),
        loss_windows=sum(1 for value in returns if value < 0),
        first_start=months_labels[0],
        last_start=months_labels[len(returns) - 1],
    )


def ending_value(amount: int, percent: Decimal) -> int:
    return won(Decimal(amount) * (1 + percent / PERCENT))

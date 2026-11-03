"""What a loan costs for a given amount and term, at one yearly rate.

Interest-only (만기일시상환): interest every month, the whole amount back at the end.
Instalments (분할상환): equal principal-and-interest payments (원리금균등), the usual way to work out a monthly payment.
Loan interest is not taxed here; fees, guarantee charges and the rate the lender finally gives are not included.
"""

from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.calculators.maturity import MONTHS_IN_YEAR, PERCENT, won


@dataclass(frozen=True)
class LoanCost:
    monthly: int  # interest per month (interest-only) or the monthly payment (instalments)
    total_interest: int


def interest_only_cost(principal: int, months: int, rate_percent: Decimal) -> LoanCost:
    rate = max(Decimal("0"), rate_percent)
    yearly = Decimal(principal) * rate / PERCENT
    return LoanCost(monthly=won(yearly / MONTHS_IN_YEAR), total_interest=won(yearly * Decimal(months) / MONTHS_IN_YEAR))


def equal_payment_cost(principal: int, months: int, rate_percent: Decimal) -> LoanCost:
    rate = max(Decimal("0"), rate_percent)
    monthly_rate = rate / PERCENT / MONTHS_IN_YEAR
    if monthly_rate == 0:
        return LoanCost(monthly=won(Decimal(principal) / Decimal(months)), total_interest=0)
    payment = Decimal(principal) * monthly_rate / (1 - (1 + monthly_rate) ** -months)
    return LoanCost(monthly=won(payment), total_interest=max(0, won(payment * Decimal(months)) - principal))

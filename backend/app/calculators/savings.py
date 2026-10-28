from dataclasses import dataclass
from decimal import Decimal, ROUND_HALF_UP


MONTHS_IN_YEAR = Decimal("12")
PERCENT = Decimal("100")


@dataclass(frozen=True)
class SavingsAmounts:
    principal: int
    deposit_interest: int
    government_contribution: int
    government_contribution_interest: int
    expected_maturity_amount: int


def calculate_fixed_monthly_savings(
    monthly_amount: int,
    term_months: int,
    expected_rate: Decimal,
    base_rate: Decimal,
    contribution_rate: Decimal,
) -> SavingsAmounts:
    amount = Decimal(monthly_amount)
    months = Decimal(term_months)
    interest_month_sum = months * (months + Decimal("1")) / Decimal("2")
    principal = amount * months
    deposit_interest = amount * (expected_rate / PERCENT) / MONTHS_IN_YEAR * interest_month_sum
    monthly_contribution = amount * (contribution_rate / PERCENT)
    government_contribution = monthly_contribution * months
    government_interest = monthly_contribution * (base_rate / PERCENT) / MONTHS_IN_YEAR * interest_month_sum

    return SavingsAmounts(
        principal=_won(principal),
        deposit_interest=_won(deposit_interest),
        government_contribution=_won(government_contribution),
        government_contribution_interest=_won(government_interest),
        expected_maturity_amount=_won(principal + deposit_interest + government_contribution + government_interest),
    )


def _won(value: Decimal) -> int:
    return int(value.quantize(Decimal("1"), rounding=ROUND_HALF_UP))

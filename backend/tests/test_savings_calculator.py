from decimal import Decimal

from app.calculators.savings import calculate_fixed_monthly_savings


def test_official_seven_percent_general_example() -> None:
    result = calculate_fixed_monthly_savings(
        monthly_amount=500_000,
        term_months=36,
        expected_rate=Decimal("7.00"),
        base_rate=Decimal("5.00"),
        contribution_rate=Decimal("6.00"),
    )

    assert result.principal == 18_000_000
    assert result.deposit_interest == 1_942_500
    assert result.government_contribution == 1_080_000
    assert result.government_contribution_interest == 83_250
    assert result.expected_maturity_amount == 21_105_750


def test_official_eight_percent_general_example() -> None:
    result = calculate_fixed_monthly_savings(
        monthly_amount=500_000,
        term_months=36,
        expected_rate=Decimal("8.00"),
        base_rate=Decimal("5.00"),
        contribution_rate=Decimal("6.00"),
    )

    assert result.deposit_interest == 2_220_000
    assert result.expected_maturity_amount == 21_383_250

from decimal import Decimal

from app.calculators.investment import MarketPoint, calculate_monthly_market_investment


def test_rising_market_calculates_fractional_monthly_purchases() -> None:
    result = calculate_monthly_market_investment(
        [1_000, 1_000],
        [MarketPoint(Decimal("10"), Decimal("100")), MarketPoint(Decimal("20"), Decimal("100"))],
    )

    assert result.principal == 2_000
    assert result.purchased_shares == Decimal("1.500000")
    assert result.ending_value == 3_000
    assert result.profit_loss == 1_000
    assert result.return_percent == Decimal("50.00")
    assert result.max_drawdown_percent == Decimal("0.00")


def test_falling_market_reports_loss_and_drawdown() -> None:
    result = calculate_monthly_market_investment(
        [1_000, 1_000],
        [MarketPoint(Decimal("20"), Decimal("100")), MarketPoint(Decimal("10"), Decimal("100"))],
    )

    assert result.ending_value == 1_500
    assert result.profit_loss == -500
    assert result.return_percent == Decimal("-25.00")
    assert result.max_drawdown_percent == Decimal("-50.00")


def test_exchange_rate_changes_purchase_and_valuation() -> None:
    result = calculate_monthly_market_investment(
        [1_000, 1_000],
        [MarketPoint(Decimal("10"), Decimal("100")), MarketPoint(Decimal("10"), Decimal("200"))],
    )

    assert result.purchased_shares == Decimal("1.500000")
    assert result.ending_value == 3_000
    assert result.max_drawdown_percent == Decimal("0.00")

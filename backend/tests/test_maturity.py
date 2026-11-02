from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from app.calculators.maturity import deposit_lump_sum, holding_returns, monthly_savings_interest, summarize
from app.services.market_service import MarketService

URL = "/api/v1/maturity-plan"


def _with_deposit_rate(client: TestClient, rate: str = "3") -> None:
    with client.app.state.session_factory() as session:
        MarketService(session).save("deposit_rate", [("202609", Decimal(rate))])


def test_deposit_is_simple_interest_with_15_4_percent_tax() -> None:
    result = deposit_lump_sum(10_000_000, 12, Decimal("3"))

    assert (result.interest, result.tax, result.ending_value, result.ending_value_after_tax) == (300_000, 46_200, 10_300_000, 10_253_800)
    assert deposit_lump_sum(10_000_000, 24, Decimal("-1")).interest == 0


def test_monthly_savings_interest_matches_the_savings_calculator_rule() -> None:
    # 500,000 × 3% / 12 × (12 + 11 + ... + 1) = 97,500
    assert monthly_savings_interest(500_000, 12, Decimal("3")) == 97_500


def test_holding_returns_try_every_start_month_and_summarize_the_range() -> None:
    prices = [Decimal("100"), Decimal("110"), Decimal("99"), Decimal("120")]
    returns = holding_returns(prices, 2)
    summary = summarize(returns, ["2023-10", "2023-11", "2023-12", "2024-01"])

    assert [value.quantize(Decimal("0.01")) for value in returns] == [Decimal("-1.00"), Decimal("9.09")]
    assert (summary.windows, summary.loss_windows, summary.worst_percent, summary.best_percent) == (2, 1, Decimal("-1.00"), Decimal("9.09"))
    assert (summary.first_start, summary.last_start) == ("2023-10", "2023-11")
    assert summarize([], []) is None
    with pytest.raises(ValueError):
        holding_returns([Decimal("0"), Decimal("1")], 1)


def test_plan_puts_choices_that_fit_the_profile_first_and_keeps_every_choice(client: TestClient) -> None:
    _with_deposit_rate(client)

    body = client.post(URL, json={"amount": 10_000_000, "months": 12, "profile": "stable"}).json()

    options = body["options"]
    assert [option["code"] for option in options] == ["deposit", "bond", "schd", "kosdaq150", "nasdaq100", "qld"]
    assert [option["fitsProfile"] for option in options] == [True, True, False, False, False, False]
    deposit = options[0]
    assert deposit["principalProtected"] is True and deposit["history"] is None
    assert deposit["deposit"] == {
        "ratePercent": "3.00", "ratePeriod": "202609", "interest": 300_000, "tax": 46_200,
        "endingValue": 10_300_000, "endingValueAfterTax": 10_253_800,
    }
    for option in options[1:]:
        history = option["history"]
        assert option["principalProtected"] is False and option["deposit"] is None
        assert history["windows"] == 24 and history["firstStart"] == "2023-10" and history["lastStart"] == "2025-09"
        assert Decimal(history["worstPercent"]) <= Decimal(history["averagePercent"]) <= Decimal(history["bestPercent"])
        assert "원금 손실" in option["riskLabel"] or "손실" in option["riskLabel"]
    assert (body["dataStart"], body["dataEnd"]) == ("2023-10", "2026-09")
    for option in options[1:]:
        # Any choice that never lost money in this short sample says plainly that it still can.
        assert ("손해 본 적이 없었지만" in option["warning"]) == (option["history"]["lossWindows"] == 0)
    assert any("예측하거나 보장하지 않아요" in note for note in body["notes"])
    assert any("권하지 않아요" in note for note in body["notes"])

    aggressive = client.post(URL, json={"amount": 10_000_000, "months": 24, "profile": "aggressive"}).json()
    assert all(option["fitsProfile"] for option in aggressive["options"])
    assert aggressive["options"][1]["history"]["windows"] == 12


def test_mix_blends_the_deposit_and_one_asset_in_every_window(client: TestClient) -> None:
    _with_deposit_rate(client)
    base = {"amount": 10_000_000, "months": 12, "profile": "balanced"}

    alone = client.post(URL, json=base).json()
    qqq = next(option for option in alone["options"] if option["code"] == "nasdaq100")["history"]
    mixed = client.post(URL, json={**base, "mix": {"assetCode": "nasdaq100", "depositShare": 70}}).json()["mix"]
    all_deposit = client.post(URL, json={**base, "mix": {"assetCode": "nasdaq100", "depositShare": 100}}).json()["mix"]

    assert mixed["depositShare"] == 70 and mixed["assetName"].endswith("(QQQ)")
    expected_worst = Decimal("0.7") * 3 + Decimal("0.3") * Decimal(qqq["worstPercent"])
    assert abs(Decimal(mixed["history"]["worstPercent"]) - expected_worst) <= Decimal("0.01")
    assert all_deposit["history"]["worstPercent"] == all_deposit["history"]["bestPercent"] == "3.00"
    assert all_deposit["history"]["lossWindows"] == 0


def test_plan_warns_above_the_deposit_protection_limit(client: TestClient) -> None:
    _with_deposit_rate(client)
    small = client.post(URL, json={"amount": 100_000_000, "months": 12, "profile": "stable"}).json()["options"][0]
    large = client.post(URL, json={"amount": 150_000_000, "months": 12, "profile": "stable"}).json()["options"][0]

    assert "1억 원까지만" not in small["warning"]
    assert "1억 원까지만 예금자보호" in large["warning"]


def test_plan_rejects_bad_input_and_reports_missing_data(client: TestClient) -> None:
    assert client.post(URL, json={"amount": 10_000_000, "months": 12, "profile": "stable"}).status_code == 503

    _with_deposit_rate(client)
    bad = [
        {"amount": 50_000, "months": 12, "profile": "stable"},
        {"amount": 10_000_000, "months": 18, "profile": "stable"},
        {"amount": 10_000_000, "months": 12, "profile": "yolo"},
        {"amount": 10_000_000, "months": 12, "profile": "stable", "mix": {"assetCode": "nasdaq100", "depositShare": 75}},
        {"amount": 10_000_000, "months": 12, "profile": "stable", "mix": {"assetCode": "bitcoin", "depositShare": 50}},
    ]
    assert [client.post(URL, json=payload).status_code for payload in bad] == [422] * 5


def test_rate_scenario_is_calculated_on_the_server(client: TestClient) -> None:
    body = client.post("/api/v1/rate-scenario", json={"monthlyAmount": 500_000, "months": 12, "ratePercent": "3", "step": "0.25"}).json()

    up, same, down = body["cases"]
    assert (up["key"], same["key"], down["key"]) == ("up", "same", "down")
    assert (same["interest"], same["tax"], same["afterTax"]) == (97_500, 15_015, 6_082_485)
    assert (up["afterTax"], up["differenceFromSame"]) == (6_089_359, 6_874)
    assert (down["afterTax"], down["differenceFromSame"]) == (6_075_612, -6_873)

    floor = client.post("/api/v1/rate-scenario", json={"monthlyAmount": 500_000, "months": 6, "ratePercent": "0.1", "step": "1"}).json()
    assert floor["cases"][2]["ratePercent"] == "0" and floor["cases"][2]["interest"] == 0
    assert client.post("/api/v1/rate-scenario", json={"monthlyAmount": 500_000, "months": 12, "ratePercent": "3", "step": "0.3"}).status_code == 422

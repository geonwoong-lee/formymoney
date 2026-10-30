"""월 50만원·일반형 기준 은행별 계산 결과를 고정해 계산식 변경을 잡는 회귀 테스트."""

import pytest
from fastapi.testclient import TestClient

HIGH_RATE_BANKS = {"hana", "ibk", "kb", "nh", "post", "shinhan", "woori"}
UNKNOWN_MATURITY = 20_550_750
HIGH_RATE_MATURITY = 21_383_250
OTHER_RATE_MATURITY = 21_105_750


def _answers(client: TestClient, answer: str) -> dict[str, dict[str, str]]:
    products = client.get("/api/v1/savings/products").json()["products"]
    return {
        product["bankCode"]: {condition["code"]: answer for condition in product["conditions"]}
        for product in products
    }


def _calculate(client: TestClient, answer: str) -> list[dict]:
    response = client.post(
        "/api/v1/savings/calculate",
        json={
            "monthlyAmount": 500_000,
            "contributionType": "general",
            "conditionAnswers": _answers(client, answer),
        },
    )
    assert response.status_code == 200
    return response.json()["results"]


def test_unknown_answers_never_add_bonus_rate(client: TestClient) -> None:
    results = _calculate(client, "unknown")

    assert len(results) == 14
    for bank in results:
        assert bank["appliedBonusRate"] == 0
        assert bank["expectedRate"] == bank["baseRate"] == 5.0
        assert bank["expectedMaturityAmount"] == UNKNOWN_MATURITY


def test_all_conditions_met_matches_published_maximum_rate(client: TestClient) -> None:
    results = _calculate(client, "yes")

    for bank in results:
        assert bank["expectedRate"] == bank["maximumRate"]
        expected = HIGH_RATE_MATURITY if bank["bankCode"] in HIGH_RATE_BANKS else OTHER_RATE_MATURITY
        assert bank["expectedMaturityAmount"] == expected, bank["bankCode"]


def test_maturity_amount_is_sum_of_its_parts(client: TestClient) -> None:
    for answer in ("unknown", "yes", "no"):
        for bank in _calculate(client, answer):
            parts = (
                bank["principal"]
                + bank["depositInterest"]
                + bank["governmentContribution"]
                + bank["governmentContributionInterest"]
            )
            assert bank["expectedMaturityAmount"] == parts, (answer, bank["bankCode"])
            assert bank["expectedRate"] <= bank["maximumRate"]


def test_results_are_sorted_by_maturity_amount_descending(client: TestClient) -> None:
    amounts = [bank["expectedMaturityAmount"] for bank in _calculate(client, "yes")]

    assert amounts == sorted(amounts, reverse=True)


@pytest.mark.parametrize("bank_code", ["kb", "busan"])
def test_flat_cashflow_equals_fixed_plan(client: TestClient, bank_code: str) -> None:
    response = client.post(
        "/api/v1/savings/calculate-cashflow",
        json={
            "bankCode": bank_code,
            "monthlyAmounts": [500_000] * 36,
            "fixedMonthlyAmount": 500_000,
            "contributionType": "general",
            "conditionAnswers": {},
        },
    )

    assert response.status_code == 200
    body = response.json()
    assert body["differenceFromFixedPlan"] == 0
    assert body["result"]["expectedMaturityAmount"] == UNKNOWN_MATURITY


def test_skipping_months_lowers_maturity_amount(client: TestClient) -> None:
    amounts = [500_000] * 36
    amounts[10] = 0
    amounts[11] = 100_000

    response = client.post(
        "/api/v1/savings/calculate-cashflow",
        json={
            "bankCode": "kb",
            "monthlyAmounts": amounts,
            "fixedMonthlyAmount": 500_000,
            "contributionType": "general",
            "conditionAnswers": {},
        },
    )

    body = response.json()
    assert response.status_code == 200
    assert body["differenceFromFixedPlan"] < 0
    assert body["result"]["principal"] == 500_000 * 34 + 100_000

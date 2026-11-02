from fastapi.testclient import TestClient


def _calculate(client: TestClient, **changes: object):
    payload = {
        "monthlyAmount": 500_000,
        "contributionType": "general",
        "conditionAnswers": {},
    }
    payload.update(changes)
    return client.post("/api/v1/savings/calculate", json=payload)


def test_products_returns_questions_sources_and_limits(client: TestClient) -> None:
    response = client.get("/api/v1/savings/products")

    assert response.status_code == 200
    body = response.json()
    assert body["policy"]["termMonths"] == 36
    assert body["policy"]["maximumMonthlyAmount"] == 500_000
    assert len(body["products"]) == 14
    assert {product["bankCode"] for product in body["products"]} >= {"kb", "shinhan", "kakao", "post"}
    assert all(product["sourceUrl"].startswith("https://") for product in body["products"])
    assert all(product["conditions"] for product in body["products"])


def test_no_conditions_uses_base_rate_and_official_general_contribution(client: TestClient) -> None:
    response = _calculate(client, bankCodes=["kb"])

    assert response.status_code == 200
    result = response.json()["results"][0]
    assert result["expectedRate"] == 5
    assert result["principal"] == 18_000_000
    assert result["depositInterest"] == 1_387_500
    assert result["governmentContribution"] == 1_080_000
    assert result["governmentContributionInterest"] == 83_250
    assert result["expectedMaturityAmount"] == 20_550_750


def test_all_kb_conditions_apply_up_to_the_published_cap(client: TestClient) -> None:
    answers = {
        "salary_transfer": "yes",
        "withdrawal_activity": "yes",
        "first_or_linked": "yes",
        "income_plus": "yes",
        "financial_counseling": "yes",
    }
    result = _calculate(client, bankCodes=["kb"], conditionAnswers={"kb": answers}).json()["results"][0]

    assert result["expectedRate"] == 8
    relationship = next(item for item in result["conditions"] if item["code"] == "first_or_linked")
    assert relationship["status"] == "applied"
    assert relationship["appliedBonusRate"] == 0.5


def test_unknown_is_never_applied_and_no_contribution_is_supported(client: TestClient) -> None:
    response = _calculate(
        client,
        contributionType="none",
        bankCodes=["shinhan"],
        conditionAnswers={"shinhan": {"income_plus": "unknown", "financial_counseling": "no"}},
    )

    result = response.json()["results"][0]
    assert result["expectedRate"] == 5
    assert result["governmentContribution"] == 0
    assert result["conditions"][0]["status"] == "needs_review"


def test_preferred_contribution_and_partial_conditions_are_calculated(client: TestClient) -> None:
    response = _calculate(
        client,
        contributionType="preferred",
        bankCodes=["shinhan"],
        conditionAnswers={"shinhan": {"income_plus": "yes", "income_transfer": "yes"}},
    )

    result = response.json()["results"][0]
    assert result["expectedRate"] == 5.8
    assert result["governmentContribution"] == 2_160_000
    assert result["governmentContributionInterest"] == 166_500


def test_results_are_sorted_and_show_difference_from_current_bank(client: TestClient) -> None:
    response = _calculate(
        client,
        currentBankCode="kb",
        conditionAnswers={"shinhan": {"income_plus": "yes"}},
    )

    results = response.json()["results"]
    shinhan = next(result for result in results if result["bankCode"] == "shinhan")
    kb = next(result for result in results if result["bankCode"] == "kb")
    assert shinhan["differenceFromCurrentBank"] > 0
    assert kb["differenceFromCurrentBank"] == 0


def test_invalid_amount_and_unknown_condition_return_422(client: TestClient) -> None:
    assert _calculate(client, monthlyAmount=999).status_code == 422
    response = _calculate(client, conditionAnswers={"kb": {"invented": "yes"}})
    assert response.status_code == 422
    assert response.json()["error"]["code"] == "http_error"


def test_minimum_monthly_amount_is_accepted(client: TestClient) -> None:
    response = _calculate(client, monthlyAmount=1_000, bankCodes=["kb"])

    assert response.status_code == 200
    assert response.json()["results"][0]["principal"] == 36_000


def test_same_request_is_deterministic(client: TestClient) -> None:
    first = _calculate(client).json()
    second = _calculate(client).json()

    assert first == second


def _calculate_cashflow(client: TestClient, **changes: object):
    payload = {
        "bankCode": "kb",
        "monthlyAmounts": [500_000] * 36,
        "fixedMonthlyAmount": 500_000,
        "contributionType": "general",
        "conditionAnswers": {},
    }
    payload.update(changes)
    return client.post("/api/v1/savings/calculate-cashflow", json=payload)


def test_cashflow_with_same_monthly_amount_matches_fixed_plan(client: TestClient) -> None:
    response = _calculate_cashflow(client)

    assert response.status_code == 200
    body = response.json()
    assert body["termMonths"] == 36
    assert body["result"]["principal"] == 18_000_000
    assert body["result"]["expectedMaturityAmount"] == 20_550_750
    assert body["fixedExpectedMaturityAmount"] == 20_550_750
    assert body["differenceFromFixedPlan"] == 0


def test_cashflow_zero_month_removes_principal_interest_and_contribution(client: TestClient) -> None:
    monthly_amounts = [0] + [500_000] * 35
    response = _calculate_cashflow(client, monthlyAmounts=monthly_amounts)

    assert response.status_code == 200
    result = response.json()["result"]
    assert result["principal"] == sum(monthly_amounts)
    assert result["depositInterest"] == 1_312_500
    assert result["governmentContribution"] == 1_050_000
    assert result["governmentContributionInterest"] == 78_750
    assert result["expectedMaturityAmount"] == 19_941_250
    assert response.json()["differenceFromFixedPlan"] == -609_500


def test_cashflow_supports_reduced_and_multiple_changed_months(client: TestClient) -> None:
    monthly_amounts = [250_000, 0, 100_000] + [500_000] * 33
    response = _calculate_cashflow(client, monthlyAmounts=monthly_amounts)

    assert response.status_code == 200
    result = response.json()["result"]
    assert result["principal"] == sum(monthly_amounts)
    assert result["governmentContribution"] == round(sum(monthly_amounts) * 0.06)
    assert result["expectedMaturityAmount"] < response.json()["fixedExpectedMaturityAmount"]


def test_cashflow_rejects_wrong_month_count_and_invalid_amount(client: TestClient) -> None:
    assert _calculate_cashflow(client, monthlyAmounts=[500_000] * 35).status_code == 422
    assert _calculate_cashflow(client, monthlyAmounts=[500_000] * 35 + [-1]).status_code == 422
    assert _calculate_cashflow(client, monthlyAmounts=[500_000] * 35 + [501_000]).status_code == 422
    assert _calculate_cashflow(client, monthlyAmounts=[500_000] * 35 + [999]).status_code == 422


def _month_impact(client: TestClient, **changes: object):
    payload = {
        "bankCode": "kb",
        "monthlyAmounts": [500_000] * 36,
        "fixedMonthlyAmount": 500_000,
        "contributionType": "general",
        "conditionAnswers": {},
        "monthNumber": 1,
        "reducedAmount": 250_000,
    }
    payload.update(changes)
    return client.post("/api/v1/savings/month-impact", json=payload)


def test_month_impact_matches_cashflow_results(client: TestClient) -> None:
    response = _month_impact(client)

    assert response.status_code == 200
    scenarios = {item["key"]: item for item in response.json()["scenarios"]}
    assert scenarios["keep"]["expectedMaturityAmount"] == 20_550_750
    assert scenarios["keep"]["differenceFromKeep"] == 0
    # 미납은 기존 월별 계산(0원 한 달)의 검증값과 같아야 한다.
    assert scenarios["skip"]["expectedMaturityAmount"] == 19_941_250
    assert scenarios["skip"]["differenceFromKeep"] == -609_500
    reduced = _calculate_cashflow(client, monthlyAmounts=[250_000] + [500_000] * 35).json()
    assert scenarios["reduce"]["expectedMaturityAmount"] == reduced["result"]["expectedMaturityAmount"]
    assert scenarios["skip"]["expectedMaturityAmount"] < scenarios["reduce"]["expectedMaturityAmount"] < scenarios["keep"]["expectedMaturityAmount"]
    assert response.json()["unavailableNotes"]
    # 이자·정부기여금 차이도 기존 월별 계산 결과와 일치해야 한다.
    keep_result = _calculate_cashflow(client).json()["result"]
    skip_result = _calculate_cashflow(client, monthlyAmounts=[0] + [500_000] * 35).json()["result"]
    assert scenarios["skip"]["depositInterestDifferenceFromKeep"] == skip_result["depositInterest"] - keep_result["depositInterest"]
    assert scenarios["skip"]["governmentContributionDifferenceFromKeep"] == (
        skip_result["governmentContribution"] + skip_result["governmentContributionInterest"]
        - keep_result["governmentContribution"] - keep_result["governmentContributionInterest"]
    )
    assert scenarios["keep"]["depositInterestDifferenceFromKeep"] == 0


def test_month_impact_rejects_reduction_when_month_is_already_zero_or_minimum(client: TestClient) -> None:
    amounts = [500_000] * 36
    amounts[0] = 0
    assert _month_impact(client, monthlyAmounts=amounts, reducedAmount=1_000).status_code == 422
    amounts[0] = 1_000
    assert _month_impact(client, monthlyAmounts=amounts, reducedAmount=1_000).status_code == 422


def test_month_impact_uses_existing_plan_for_other_months(client: TestClient) -> None:
    amounts = [500_000] * 36
    amounts[5] = 300_000
    response = _month_impact(client, monthlyAmounts=amounts, monthNumber=1)

    scenarios = {item["key"]: item for item in response.json()["scenarios"]}
    expected = _calculate_cashflow(client, monthlyAmounts=amounts).json()
    assert scenarios["keep"]["expectedMaturityAmount"] == expected["result"]["expectedMaturityAmount"]
    assert scenarios["skip"]["principal"] == sum(amounts) - 500_000


def test_month_impact_rejects_invalid_requests(client: TestClient) -> None:
    assert _month_impact(client, monthNumber=37).status_code == 422
    assert _month_impact(client, reducedAmount=500_000).status_code == 422
    assert _month_impact(client, reducedAmount=999).status_code == 422
    assert _month_impact(client, reducedAmount=250_001).status_code == 422
    assert _month_impact(client, monthlyAmounts=[500_000] * 35).status_code == 422

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
    assert [product["bankCode"] for product in body["products"]] == ["kb", "shinhan"]
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


def test_all_direct_kb_conditions_apply_but_review_condition_does_not(client: TestClient) -> None:
    answers = {
        "salary_transfer": "yes",
        "withdrawal_activity": "yes",
        "relationship_thanks": "yes",
        "income_plus": "yes",
        "financial_counseling": "yes",
    }
    result = _calculate(client, bankCodes=["kb"], conditionAnswers={"kb": answers}).json()["results"][0]

    assert result["expectedRate"] == 7.5
    relationship = next(item for item in result["conditions"] if item["code"] == "relationship_thanks")
    assert relationship["status"] == "needs_review"
    assert relationship["appliedBonusRate"] == 0


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
    assert results[0]["bankCode"] == "shinhan"
    assert results[0]["differenceFromCurrentBank"] > 0
    assert results[1]["differenceFromCurrentBank"] == 0


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

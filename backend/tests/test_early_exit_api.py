from fastapi.testclient import TestClient


def _early_exit(client: TestClient, **changes: object):
    payload = {
        "bankCode": "kb",
        "monthlyAmounts": [500_000] * 36,
        "fixedMonthlyAmount": 500_000,
        "contributionType": "general",
        "conditionAnswers": {},
        "paidMonths": 12,
    }
    payload.update(changes)
    return client.post("/api/v1/savings/early-exit", json=payload)


def _cashflow(client: TestClient, amounts: list[int]):
    return client.post("/api/v1/savings/calculate-cashflow", json={
        "bankCode": "kb",
        "monthlyAmounts": amounts,
        "fixedMonthlyAmount": 500_000,
        "contributionType": "general",
        "conditionAnswers": {},
    }).json()["result"]


def test_termination_reference_uses_base_rate_for_months_held_and_taxes_the_interest(client: TestClient) -> None:
    response = _early_exit(client)

    assert response.status_code == 200
    body = response.json()
    assert body["monthsLeft"] == 24
    termination = body["termination"]
    assert termination["principal"] == 6_000_000
    # 50만 원 × 5% ÷ 12 × (12 + 11 + ... + 1 = 78개월)
    assert termination["interestAtBaseRate"] == 162_500
    assert termination["interestTax"] == 25_025  # 15.4%
    assert termination["receivedAtBaseRate"] == 6_137_475
    # 지금까지 쌓인 정부기여금(일반형 6%)은 일반 중도해지 때 받지 못한다.
    assert termination["lostGovernmentContribution"] == 360_000
    assert body["specialTerminationReasons"]
    assert body["specialTerminationSourceUrl"].startswith("https://www.kakaobank.com/")
    assert any("참고값" in note for note in body["unavailableNotes"])


def test_scenarios_match_the_existing_monthly_calculation(client: TestClient) -> None:
    body = _early_exit(client).json()
    scenarios = {item["key"]: item for item in body["scenarios"]}

    paused = _cashflow(client, [500_000] * 12 + [0] * 24)
    minimum = _cashflow(client, [500_000] * 12 + [1_000] * 24)
    keep = _cashflow(client, [500_000] * 36)
    assert scenarios["pause"]["expectedMaturityAmount"] == paused["expectedMaturityAmount"] == 7_168_250
    assert scenarios["minimum"]["expectedMaturityAmount"] == minimum["expectedMaturityAmount"]
    assert scenarios["keep"]["expectedMaturityAmount"] == keep["expectedMaturityAmount"] == 20_550_750
    assert scenarios["pause"]["principal"] == body["termination"]["principal"]
    assert scenarios["pause"]["moreThanTermination"] == 7_168_250 - 6_137_475
    assert scenarios["minimum"]["futureMonthlyAmount"] == 1_000
    assert scenarios["pause"]["extraPrincipal"] == 0
    assert scenarios["minimum"]["extraPrincipal"] == 24_000
    assert scenarios["keep"]["extraPrincipal"] == 12_000_000
    assert scenarios["keep"]["futureMonthlyAmount"] is None


def test_skipped_months_before_termination_are_not_counted(client: TestClient) -> None:
    amounts = [500_000] * 36
    amounts[0] = 0
    termination = _early_exit(client, monthlyAmounts=amounts, paidMonths=2).json()["termination"]

    assert termination["principal"] == 500_000
    # 2회차 돈만 1개월 예치: 500,000 × 5% ÷ 12
    assert termination["interestAtBaseRate"] == 2_083
    # 세금은 기존 세후 계산처럼 원 아래를 버린다: 2,083 × 15.4% = 320.78 → 320
    assert termination["interestTax"] == 320
    assert termination["receivedAtBaseRate"] == 500_000 + 2_083 - 320


def test_first_and_last_valid_rounds(client: TestClient) -> None:
    first = _early_exit(client, paidMonths=1).json()
    assert first["monthsLeft"] == 35
    assert first["termination"]["principal"] == 500_000
    assert first["termination"]["interestAtBaseRate"] == 2_083

    last = _early_exit(client, paidMonths=35).json()
    assert last["monthsLeft"] == 1
    assert last["termination"]["principal"] == 17_500_000
    scenarios = {item["key"]: item for item in last["scenarios"]}
    assert scenarios["pause"]["expectedMaturityAmount"] == _cashflow(client, [500_000] * 35 + [0])["expectedMaturityAmount"]


def test_no_contribution_type_loses_no_contribution(client: TestClient) -> None:
    body = _early_exit(client, contributionType="none").json()

    assert body["termination"]["lostGovernmentContribution"] == 0
    assert all(item["governmentContribution"] == 0 for item in body["scenarios"])


def test_preferred_contribution_type_counts_its_own_rate(client: TestClient) -> None:
    termination = _early_exit(client, contributionType="preferred").json()["termination"]
    general = _early_exit(client).json()["termination"]

    assert termination["lostGovernmentContribution"] > general["lostGovernmentContribution"]


def test_paid_months_must_be_inside_the_term_and_inputs_are_checked(client: TestClient) -> None:
    assert _early_exit(client, paidMonths=0).status_code == 422
    assert _early_exit(client, paidMonths=36).status_code == 422
    assert _early_exit(client, monthlyAmounts=[500_000] * 35).status_code == 422
    assert _early_exit(client, bankCode="nowhere").status_code == 422

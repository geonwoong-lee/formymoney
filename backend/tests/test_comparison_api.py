from fastapi.testclient import TestClient


def _payload() -> dict[str, object]:
    return {
        "bankCode": "kb",
        "monthlyAmounts": [500_000] * 36,
        "fixedMonthlyAmount": 500_000,
        "contributionType": "general",
        "conditionAnswers": {},
        "assetCodes": ["nasdaq100", "schd", "qld", "bond", "kosdaq150"],
    }


def test_comparison_uses_same_cashflow_for_savings_and_investments(client: TestClient) -> None:
    response = client.post("/api/v1/comparisons/calculate", json=_payload())

    assert response.status_code == 200
    body = response.json()
    assert body["historicalScenario"] is True
    assert body["dividendsReinvested"] is True
    assert len(body["results"]) == 6
    assert all(result["principal"] == 18_000_000 for result in body["results"])
    assert body["results"][0]["kind"] == "savings"
    assert {item["ticker"] for item in body["results"][1:]} == {"QQQ", "SCHD", "QLD", "BND", "229200.KS"}


def test_comparison_exposes_risk_and_unreflected_costs(client: TestClient) -> None:
    body = client.post("/api/v1/comparisons/calculate", json=_payload()).json()
    qld = next(item for item in body["results"] if item["ticker"] == "QLD")

    assert qld["leveraged"] is True
    assert qld["maxDrawdownPercent"] < 0
    assert "세금 미반영" in qld["taxTreatment"]
    assert "수수료 미반영" in qld["feeTreatment"]
    assert "추천하지 않습니다" in body["notice"]
    kosdaq = next(item for item in body["results"] if item["ticker"] == "229200.KS")
    assert kosdaq["fxTreatment"] == "원화 자산 · 환율 변환 없음"


def test_comparison_rejects_missing_assets_and_invalid_months(client: TestClient) -> None:
    payload = _payload()
    payload["assetCodes"] = []
    assert client.post("/api/v1/comparisons/calculate", json=payload).status_code == 422

    payload = _payload()
    payload["monthlyAmounts"] = [500_000] * 35
    assert client.post("/api/v1/comparisons/calculate", json=payload).status_code == 422

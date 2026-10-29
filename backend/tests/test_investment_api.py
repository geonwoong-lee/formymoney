from fastapi.testclient import TestClient
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.models.investment import InvestmentAsset, InvestmentMonthlyPoint


def _calculate(client: TestClient, **changes: object):
    payload = {"monthlyAmounts": [500_000] * 36}
    payload.update(changes)
    return client.post("/api/v1/investments/calculate", json=payload)


def test_seed_contains_four_assets_and_36_points_each(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        assets = list(session.scalars(select(InvestmentAsset).options(selectinload(InvestmentAsset.points))).all())
        point_count = session.scalar(select(func.count()).select_from(InvestmentMonthlyPoint))

    assert {asset.code for asset in assets} == {"nasdaq100", "schd", "qld", "bond", "kosdaq150"}
    assert point_count == 180
    assert all(len(asset.points) == 36 for asset in assets)


def test_assets_endpoint_explains_sources_and_unreflected_costs(client: TestClient) -> None:
    response = client.get("/api/v1/investments/assets")

    assert response.status_code == 200
    body = response.json()
    assert len(body["assets"]) == 5
    assert body["taxIncluded"] is False
    assert body["tradingFeeIncluded"] is False
    assert body["fxIncluded"] is True
    assert all(asset["availableMonths"] == 36 for asset in body["assets"])
    assert all(asset["providerSourceUrl"].startswith("https://") for asset in body["assets"])


def test_same_cashflow_is_calculated_for_all_real_price_series(client: TestClient) -> None:
    response = _calculate(client)

    assert response.status_code == 200
    body = response.json()
    assert body["startMonth"] == "2023-10"
    assert body["endMonth"] == "2026-09"
    assert body["historicalScenario"] is True
    assert {result["asset"]["ticker"] for result in body["results"]} == {"QQQ", "SCHD", "QLD", "BND", "229200.KS"}
    assert all(result["principal"] == 18_000_000 for result in body["results"])
    assert all(result["endingValue"] > 0 for result in body["results"])


def test_qld_uses_its_own_series_instead_of_double_qqq_return(client: TestClient) -> None:
    results = _calculate(client, assetCodes=["nasdaq100", "qld"]).json()["results"]
    qqq = next(result for result in results if result["asset"]["ticker"] == "QQQ")
    qld = next(result for result in results if result["asset"]["ticker"] == "QLD")

    assert qld["returnPercent"] != qqq["returnPercent"] * 2
    assert qld["asset"]["leveraged"] is True
    assert "단순 2배가 아니" in qld["asset"]["warning"]


def test_kosdaq_uses_krw_prices_without_exchange_conversion(client: TestClient) -> None:
    result = _calculate(client, assetCodes=["kosdaq150"]).json()["results"][0]

    assert result["asset"]["ticker"] == "229200.KS"
    assert result["asset"]["currency"] == "KRW"
    assert "코스닥 전체지수가 아니라" in result["asset"]["warning"]


def test_zero_month_and_invalid_requests_are_handled(client: TestClient) -> None:
    amounts = [0] + [500_000] * 35
    response = _calculate(client, monthlyAmounts=amounts, assetCodes=["bond"])
    assert response.status_code == 200
    assert response.json()["results"][0]["principal"] == sum(amounts)

    assert _calculate(client, monthlyAmounts=[500_000] * 35).status_code == 422
    assert _calculate(client, assetCodes=["invented"]).status_code == 422

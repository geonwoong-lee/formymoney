from fastapi.testclient import TestClient

from app.services.rate_limiter import SlidingWindowLimiter

URL = "/api/v1/public/savings-estimate"


def test_estimate_gives_a_base_to_maximum_range_for_every_bank_matching_the_main_calculation(client: TestClient) -> None:
    response = client.get(URL, params={"monthlyAmount": 500_000, "contributionType": "general"}, headers={"Origin": "https://partner.example"})

    assert response.status_code == 200
    # 어느 출처의 화면에서든 읽을 수 있다.
    assert response.headers["access-control-allow-origin"] == "*"
    body = response.json()
    assert (body["principal"], body["termMonths"], body["contributionRate"]) == (18_000_000, 36, 6.0)
    assert len(body["banks"]) == 14
    assert [bank["bankCode"] for bank in body["banks"]] == sorted(bank["bankCode"] for bank in body["banks"])
    kb = next(bank for bank in body["banks"] if bank["bankCode"] == "kb")
    # 기본금리만은 우대조건 없이 계산한 은행 비교 값과 같다.
    main = client.post("/api/v1/savings/calculate", json={"monthlyAmount": 500_000, "contributionType": "general", "conditionAnswers": {}, "bankCodes": ["kb"]}).json()["results"][0]
    assert kb["maturityAtBaseRate"] == main["expectedMaturityAmount"] == 20_550_750
    assert kb["maximumRate"] == main["maximumRate"] == 8
    assert kb["maturityAtMaximumRate"] > kb["maturityAtBaseRate"]
    assert all(bank["sourceUrl"].startswith("https://") for bank in body["banks"])
    assert "추천하지 않습니다" in body["disclaimer"]


def test_contribution_type_changes_only_the_contribution(client: TestClient) -> None:
    none = client.get(URL, params={"monthlyAmount": 100_000, "contributionType": "none"}).json()
    preferred = client.get(URL, params={"monthlyAmount": 100_000, "contributionType": "preferred"}).json()

    assert none["contributionRate"] == 0
    assert preferred["contributionRate"] == 12
    assert preferred["banks"][0]["maturityAtBaseRate"] > none["banks"][0]["maturityAtBaseRate"]


def test_bad_amounts_are_refused_and_still_readable_from_other_sites(client: TestClient) -> None:
    for params in ({"monthlyAmount": 999}, {"monthlyAmount": 501_000}, {"monthlyAmount": 10_500}, {}, {"monthlyAmount": 10_000, "contributionType": "x"}):
        response = client.get(URL, params=params)
        assert response.status_code == 422
    assert client.get(URL, params={"monthlyAmount": 10_500}).headers["access-control-allow-origin"] == "*"


def test_calls_are_limited_per_address(client: TestClient) -> None:
    client.app.state.public_limiter = SlidingWindowLimiter([(60, 1)])
    assert client.get(URL, params={"monthlyAmount": 10_000}).status_code == 200
    refused = client.get(URL, params={"monthlyAmount": 10_000})
    assert refused.status_code == 429
    assert refused.headers["access-control-allow-origin"] == "*"


def test_other_endpoints_are_not_opened_to_every_site(client: TestClient) -> None:
    response = client.get("/api/v1/savings/products", headers={"Origin": "https://partner.example"})
    assert response.headers.get("access-control-allow-origin") != "*"


def test_maximum_matches_the_main_calculation_with_every_condition_met_for_each_contribution_type(client: TestClient) -> None:
    kb_conditions = next(product for product in client.get("/api/v1/savings/products").json()["products"] if product["bankCode"] == "kb")["conditions"]
    all_yes = {condition["code"]: "yes" for condition in kb_conditions}
    for contribution_type in ("general", "preferred", "none"):
        public = client.get(URL, params={"monthlyAmount": 300_000, "contributionType": contribution_type}).json()
        kb = next(bank for bank in public["banks"] if bank["bankCode"] == "kb")
        base = client.post("/api/v1/savings/calculate", json={
            "monthlyAmount": 300_000, "contributionType": contribution_type, "conditionAnswers": {}, "bankCodes": ["kb"]}).json()["results"][0]
        best = client.post("/api/v1/savings/calculate", json={
            "monthlyAmount": 300_000, "contributionType": contribution_type, "conditionAnswers": {"kb": all_yes}, "bankCodes": ["kb"]}).json()["results"][0]
        assert best["expectedRate"] == best["maximumRate"]  # KB는 조건을 모두 채우면 공시 최고금리에 닿는다
        assert kb["maturityAtBaseRate"] == base["expectedMaturityAmount"]
        assert kb["maturityAtMaximumRate"] == best["expectedMaturityAmount"]

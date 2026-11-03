from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from datetime import date

from app.calculators.maturity import deposit_lump_sum, deposit_lump_sum_compound, holding_returns, monthly_savings_after_tax, monthly_savings_interest, summarize
from app.collectors.finlife import ProductInfo, ProductRate
from app.services.product_rate_service import ProductRateService
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


def test_compound_deposit_compounds_monthly() -> None:
    result = deposit_lump_sum_compound(10_000_000, 12, Decimal("3.6"))
    assert result.interest == 366_000  # 10,000,000 × (1.003^12 − 1) = 365,999.8
    assert result.tax == 56_364 and result.ending_value_after_tax == 10_309_636


def _deposit(company: str, name: str, base: str | None, best: str | None, months: int = 12, group: str = "은행", rate_type: str = "단리") -> ProductRate:
    return ProductRate("deposit", group, company, f"{company}-{name}", name, months, rate_type, "",
                       Decimal(base) if base else None, Decimal(best) if best else None, "202611")


def test_deposit_products_work_out_each_disclosed_deposit_for_the_users_amount(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        ProductRateService(session).save_snapshot(date(2026, 11, 3), [
            _deposit("가은행", "가 정기예금", "3.00", "3.50"),
            _deposit("나은행", "나\n정기예금", "3.50", None),
            _deposit("주식회사 다은행", "다 정기예금", "2.00", "4.00"),
            _deposit("라은행", "라 정기예금", None, "3.00"),  # no base rate: left out
            _deposit("마은행", "마 24개월", "3.90", "3.90", months=24),
            _deposit("바저축은행", "바 복리예금", "4.00", "4.00", group="저축은행", rate_type="복리"),
        ])

    body = client.post("/api/v1/maturity-plan/deposit-products", json={"amount": 10_000_000, "months": 12}).json()
    assert (body["group"], body["day"], body["count"]) == ("은행", "2026-11-03", 3)
    assert [item["company"] for item in body["products"]] == ["나은행", "가은행", "다은행"]  # base-rate result, highest first
    first = body["products"][0]
    assert first["productName"] == "나 정기예금" and first["maxAfterTax"] is None
    assert first["baseAfterTax"] == deposit_lump_sum(10_000_000, 12, Decimal("3.50")).ending_value_after_tax
    assert body["products"][2]["maxAfterTax"] == deposit_lump_sum(10_000_000, 12, Decimal("4.00")).ending_value_after_tax
    assert (body["lowest"]["ratePercent"], body["middle"]["ratePercent"], body["highest"]["ratePercent"]) == ("2.00", "3.00", "3.50")
    assert any("권하지 않아요" in note for note in body["notes"])

    savings = client.post("/api/v1/maturity-plan/deposit-products", json={"amount": 10_000_000, "months": 12, "group": "savings_bank"}).json()
    assert savings["products"][0]["baseAfterTax"] == deposit_lump_sum_compound(10_000_000, 12, Decimal("4.00")).ending_value_after_tax
    assert any("1억 원까지 예금자보호" in note for note in savings["notes"])
    assert client.post("/api/v1/maturity-plan/deposit-products", json={"amount": 10_000_000, "months": 6}).status_code == 422


def test_deposit_products_say_nothing_is_collected_yet(client: TestClient) -> None:
    body = client.post("/api/v1/maturity-plan/deposit-products", json={"amount": 10_000_000, "months": 24}).json()
    assert (body["day"], body["count"], body["products"], body["highest"]) == (None, 0, [], None)


def test_deposit_products_carry_the_joining_terms_and_flag_an_amount_over_the_limit(client: TestClient) -> None:
    info = ProductInfo("deposit", "가은행", "가은행-가 정기예금", "스마트폰", "실명의 개인", "서민 전용",
                       "급여 이체 시 연 0.2%p", 5_000_000, "최소 100만원", "만기 후 1개월: 약정이율의 50%")
    rate = _deposit("가은행", "가 정기예금", "3.00", "3.20")
    with client.app.state.session_factory() as session:
        ProductRateService(session).save_snapshot(date(2026, 11, 3), [ProductRate(**{**rate.__dict__, "info": info}), _deposit("나은행", "나 정기예금", "2.00", None)])

    products = {item["company"]: item for item in client.post(
        "/api/v1/maturity-plan/deposit-products", json={"amount": 10_000_000, "months": 12}).json()["products"]}
    first = products["가은행"]
    assert (first["joinWay"], first["joinMember"], first["joinLimit"]) == ("스마트폰", "실명의 개인", "서민 전용")
    assert first["specialConditions"] == "급여 이체 시 연 0.2%p" and first["maturityInterest"].startswith("만기 후")
    assert (first["maxLimit"], first["overLimit"]) == (5_000_000, True)
    assert (products["나은행"]["specialConditions"], products["나은행"]["overLimit"]) == ("", False)
    small = client.post("/api/v1/maturity-plan/deposit-products", json={"amount": 1_000_000, "months": 12}).json()["products"]
    assert next(item for item in small if item["company"] == "가은행")["overLimit"] is False


def test_monthly_savings_after_tax_simple_and_compound() -> None:
    from app.calculators.maturity import monthly_savings_after_tax

    simple = monthly_savings_after_tax(500_000, 12, Decimal("3.6"), compound=False)
    assert simple.interest == 117_000 and simple.tax == 18_018 and simple.ending_value_after_tax == 6_098_982

    # An independent loop: each deposit compounds monthly for the months it stays.
    expected = round(sum(500_000 * ((1 + 0.036 / 12) ** left - 1) for left in range(1, 13)))
    compound = monthly_savings_after_tax(500_000, 12, Decimal("3.6"), compound=True)
    assert compound.interest == expected and compound.interest > simple.interest
    assert monthly_savings_after_tax(500_000, 12, Decimal("0"), compound=True).ending_value_after_tax == 6_000_000


def _saving(company: str, name: str, base: str, best: str | None, months: int = 12, reserve: str = "정액적립식",
            group: str = "은행", rate_type: str = "단리", info: ProductInfo | None = None) -> ProductRate:
    return ProductRate("saving", group, company, f"{company}-{name}", name, months, rate_type, reserve,
                       Decimal(base), Decimal(best) if best else None, "202611", info)


def test_saving_products_work_out_the_end_of_term_money_for_a_monthly_amount(client: TestClient) -> None:
    limit = ProductInfo("saving", "나은행", "나은행-나 적금", "스마트폰", "실명의 개인", "제한 없음", "", 300_000, "", "")
    with client.app.state.session_factory() as session:
        ProductRateService(session).save_snapshot(date(2026, 11, 3), [
            _saving("가은행", "가 적금", "3.00", "3.60"),
            _saving("나은행", "나 적금", "3.50", None, reserve="자유적립식", info=limit),
            _saving("주식회사 다은행", "다 적금", "2.00", "2.00"),
            _saving("라은행", "라 24개월", "9.00", "9.00", months=24),
            _saving("바저축은행", "바 적금", "4.00", "4.00", group="저축은행", rate_type="복리"),
            _deposit("가은행", "가 예금", "3.00", "3.00"),
        ])

    url = "/api/v1/saving-products"
    body = client.post(url, json={"monthlyAmount": 500_000, "months": 12}).json()
    assert (body["group"], body["count"], body["principal"], body["amount"]) == ("은행", 3, 6_000_000, 500_000)
    assert [item["company"] for item in body["products"]] == ["나은행", "가은행", "다은행"]
    first = body["products"][0]
    assert first["reserveType"] == "자유적립식" and first["baseAfterTax"] == 6_000_000 + 113_750 - 17_517  # 3.5% simple: 500,000 × 3.5% ÷ 12 × 78 = 113,750
    assert (first["maxLimit"], first["overLimit"]) == (300_000, True)  # 500,000 a month is over a 300,000 limit
    assert body["lowest"]["ratePercent"] == "2.00" and body["highest"]["ratePercent"] == "3.50"
    assert any("권하지 않아요" in note for note in body["notes"])

    only_free = client.post(url, json={"monthlyAmount": 500_000, "months": 12, "reserve": "free"}).json()
    assert [item["company"] for item in only_free["products"]] == ["나은행"]
    banks = client.post(url, json={"monthlyAmount": 500_000, "months": 12, "group": "savings_bank"}).json()
    assert banks["products"][0]["baseAfterTax"] == monthly_savings_after_tax(500_000, 12, Decimal("4.00"), True).ending_value_after_tax
    assert any("1억 원까지 예금자보호" in note for note in banks["notes"])
    assert client.post(url, json={"monthlyAmount": 500_000, "months": 7}).status_code == 422
    assert client.post(url, json={"monthlyAmount": 5_000, "months": 12}).status_code == 422
    # The deposit list is untouched by the refactor: same snapshot, no savings rows in it.
    deposits = client.post("/api/v1/maturity-plan/deposit-products", json={"amount": 10_000_000, "months": 12}).json()
    assert [item["company"] for item in deposits["products"]] == ["가은행"] and deposits["principal"] is None

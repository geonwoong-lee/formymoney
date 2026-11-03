from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.collectors.finlife import ProductInfo, ProductRate
from app.services.product_rate_service import ProductRateService

URL = "/api/v1/product-detail"


def _rate(rate: str, term: int = 12, name: str = "가 적금", company: str = "주식회사 가은행", with_info: bool = True) -> ProductRate:
    info = ProductInfo(
        kind="saving", company=company, product_code="S1", join_way="앱", join_member="만 19세 이상", join_limit="제한 없음",
        special_conditions="급여 이체 시 연 0.5%p", max_limit=500_000, etc_note="", maturity_interest="단리",
    ) if with_info else None
    return ProductRate(
        kind="saving", group="은행", company=company, product_code="S1", product_name=name, term_months=term, rate_type="단리",
        reserve_type="자유적립식", base_rate=Decimal(rate), max_rate=Decimal(rate) + Decimal("0.5"), disclosed_month="202610", info=info,
    )


def test_detail_lists_each_option_with_its_rate_path_oldest_first(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = ProductRateService(session)
        service.save_snapshot(date(2026, 11, 1), [_rate("3.00"), _rate("3.40", term=24)])
        service.save_snapshot(date(2026, 11, 2), [_rate("3.10"), _rate("3.40", term=24)])
        service.save_snapshot(date(2026, 11, 3), [_rate("3.25"), _rate("3.40", term=24)])

    body = client.get(URL, params={"kind": "saving", "company": "가은행", "code": "S1"}).json()

    assert (body["productName"], body["company"], body["daysCollected"], body["firstDay"], body["lastDay"]) == ("가 적금", "가은행", 3, "2026-11-01", "2026-11-03")
    twelve, twenty_four = body["options"]
    assert (twelve["termMonths"], twenty_four["termMonths"]) == (12, 24)
    assert [Decimal(point["baseRate"]) for point in twelve["history"]] == [Decimal("3.00"), Decimal("3.10"), Decimal("3.25")]
    assert [point["day"] for point in twelve["history"]] == ["2026-11-01", "2026-11-02", "2026-11-03"]
    assert len({point["baseRate"] for point in twenty_four["history"]}) == 1
    assert body["terms"]["joinWay"] == "앱" and body["terms"]["maxLimit"] == 500_000
    assert any("권하지 않아요" in note for note in body["notes"])


def test_detail_is_not_found_for_an_unknown_product_or_another_company(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        ProductRateService(session).save_snapshot(date(2026, 11, 1), [_rate("3.00", with_info=False)])

    assert client.get(URL, params={"kind": "saving", "company": "나은행", "code": "S1"}).status_code == 404
    assert client.get(URL, params={"kind": "saving", "company": "가은행", "code": "nope"}).status_code == 404
    assert client.get(URL, params={"kind": "deposit", "company": "가은행", "code": "S1"}).status_code == 404
    assert client.get(URL, params={"kind": "loan", "company": "가은행", "code": "S1"}).status_code == 422
    assert client.get(URL, params={"kind": "saving", "company": "가은행", "code": "S1"}).json()["terms"] is None


def test_old_days_beyond_the_kept_period_are_dropped(client: TestClient) -> None:
    from app.services.product_rate_service import KEEP_DAYS

    with client.app.state.session_factory() as session:
        service = ProductRateService(session)
        service.save_snapshot(date(2026, 8, 1), [_rate("3.00")])
        service.save_snapshot(date(2026, 11, 1), [_rate("3.50")])

    body = client.get(URL, params={"kind": "saving", "company": "가은행", "code": "S1"}).json()
    assert (date(2026, 11, 1) - date(2026, 8, 1)).days > KEEP_DAYS
    assert body["daysCollected"] == 1

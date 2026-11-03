from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi.testclient import TestClient

from app.api.v1.endpoints import admin as admin_endpoint
from app.collectors.finlife import ProductRate
from app.collectors.finlife_loan import LoanRate
from app.services.loan_service import save_loans
from app.services.market_service import MarketService
from app.services.product_rate_service import ProductRateService

URL = "/api/v1/internal/collection/overview"
HEADERS = {"X-Very-Rich-Ingest-Secret": "test-ingest-secret"}


def test_overview_needs_the_internal_secret(client: TestClient) -> None:
    assert client.get(URL).status_code == 401
    assert client.get(URL, headers={"X-Very-Rich-Ingest-Secret": "wrong"}).status_code == 401


def test_overview_reports_each_source_and_marks_an_old_one_stale(client: TestClient, monkeypatch) -> None:
    monkeypatch.setattr(admin_endpoint, "korea_today", lambda: date(2026, 11, 5))
    with client.app.state.session_factory() as session:
        ProductRateService(session).save_snapshot(date(2026, 11, 5), [ProductRate(
            kind="deposit", group="은행", company="가은행", product_code="D1", product_name="가 예금", term_months=12, rate_type="단리",
            reserve_type="", base_rate=Decimal("3.00"), max_rate=None, disclosed_month="202610",
        )])
        save_loans(session, date(2026, 11, 1), [LoanRate(
            group="은행", company="가은행", product_code="L1", product_name="가 전세", repay_type="분할상환방식", rate_type="변동금리",
            rate_min=Decimal("4"), rate_max=Decimal("5"), loan_limit="", early_repay_fee="", delay_rate="", join_way="", disclosed_month="202610",
        )])
        MarketService(session).save("base_rate", [("20261104", Decimal("2.5"))], now=datetime(2026, 11, 4, 22, tzinfo=timezone.utc))

    body = client.get(URL, headers=HEADERS).json()

    assert body["productRates"] == {"day": "2026-11-05", "rows": 1, "stale": False}
    assert body["loans"] == {"day": "2026-11-01", "rows": 1, "stale": True}
    assert body["dart"] == {"banks": 0, "latestFilingDay": None}
    assert body["market"] == [{"code": "base_rate", "name": "한국은행 기준금리", "period": "20261104", "fetchedAt": body["market"][0]["fetchedAt"]}]
    assert body["market"][0]["fetchedAt"].startswith("2026-11-04")


def test_overview_is_empty_but_valid_before_anything_is_collected(client: TestClient) -> None:
    body = client.get(URL, headers=HEADERS).json()

    assert body["productRates"]["day"] is None and body["productRates"]["stale"] is True
    assert body["market"] == []

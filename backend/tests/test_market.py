from datetime import date
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient

from datetime import datetime, timezone

from app.collectors.ecos import SERIES_BY_CODE, EcosError, parse_rows, request_window
from app.models.market import MarketPoint
from app.services.market_service import MarketService


def _row(time: str, value: str) -> dict[str, str]:
    return {"STAT_CODE": "731Y001", "TIME": time, "DATA_VALUE": value}


def test_parse_rows_reads_values_and_skips_bad_rows() -> None:
    payload = {"StatisticSearch": {"row": [_row("20261030", "1,337.2"), _row("20261031", ""), _row("2026", "1"), "x"]}}

    assert parse_rows(payload) == [("20261030", Decimal("1337.2"))]


def test_parse_rows_treats_no_data_as_empty_and_other_codes_as_errors() -> None:
    assert parse_rows({"RESULT": {"CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다."}}) == []
    with pytest.raises(EcosError, match="INFO-100"):
        parse_rows({"RESULT": {"CODE": "INFO-100", "MESSAGE": "인증키가 유효하지 않습니다."}})


def test_request_window_covers_recent_days_and_months() -> None:
    today = date(2026, 1, 15)

    assert request_window("D", today) == ("20251226", "20260115")
    assert request_window("M", today) == ("202311", "202601")


def test_save_inserts_updates_revisions_and_ignores_unchanged(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = MarketService(session)
        assert service.save("usd_krw", [("20261029", Decimal("1330")), ("20261030", Decimal("1337.2"))]) == 2
        assert service.save("usd_krw", [("20261030", Decimal("1337.2"))]) == 0
        assert service.save("usd_krw", [("20261030", Decimal("1338")), ("20261031", Decimal("1340"))]) == 2


def test_resaving_the_same_value_still_marks_the_collection_time(client: TestClient) -> None:
    first = datetime(2026, 11, 1, tzinfo=timezone.utc)
    later = datetime(2026, 11, 2, tzinfo=timezone.utc)
    with client.app.state.session_factory() as session:
        service = MarketService(session)
        service.save("usd_krw", [("20261030", Decimal("1337.2"))], first)
        assert service.save("usd_krw", [("20261030", Decimal("1337.2"))], later) == 0
        row = session.query(MarketPoint).one()
        assert row.fetched_at.replace(tzinfo=timezone.utc) == later


def test_market_endpoint_returns_latest_with_change_and_rate_trend(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = MarketService(session)
        service.save("usd_krw", [("20261029", Decimal("1300")), ("20261030", Decimal("1313"))])
        service.save("kospi", [("20261030", Decimal("5730.74"))])
        service.save("base_rate_monthly", [("202608", Decimal("3")), ("202609", Decimal("3"))])
        service.save("deposit_rate", [("202609", Decimal("3.45")), ("202610", Decimal("3.5"))])

    body = client.get("/api/v1/market").json()

    groups = {group["key"]: group for group in body["groups"]}
    assert list(groups) == ["fx", "kr_stock", "rate"]
    usd = groups["fx"]["items"][0]
    assert (usd["name"], usd["period"], usd["previousPeriod"]) == ("원/달러", "20261030", "20261029")
    assert Decimal(usd["value"]) == Decimal("1313") and Decimal(usd["change"]) == Decimal("13")
    assert Decimal(usd["changePercent"]) == Decimal("1.00")
    kospi = groups["kr_stock"]["items"][0]
    assert kospi["change"] is None and "실시간 시세가 아닙니다" in groups["kr_stock"]["note"]
    assert [point["period"] for point in body["rateTrend"]] == ["202608", "202609", "202610"]
    assert body["rateTrend"][0]["depositRate"] is None
    assert Decimal(body["rateTrend"][2]["depositRate"]) == Decimal("3.5")
    assert body["sourceName"] == "한국은행 경제통계시스템(ECOS)"
    assert body["updatedAt"]


def test_rate_trend_keeps_months_without_any_data_as_gaps(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = MarketService(session)
        service.save("base_rate_monthly", [("202512", Decimal("2.5")), ("202602", Decimal("2.5"))])
        service.save("deposit_rate", [("202512", Decimal("3")), ("202602", Decimal("3.1"))])

        trend = service.rate_trend()

    assert [point.period for point in trend] == ["202512", "202601", "202602"]
    assert trend[1].base_rate is None and trend[1].deposit_rate is None


def test_market_endpoint_is_empty_before_collection(client: TestClient) -> None:
    body = client.get("/api/v1/market").json()

    assert body["groups"] == [] and body["rateTrend"] == [] and body["updatedAt"] is None


def test_every_series_has_a_known_group_and_cycle() -> None:
    assert all(series.group in {"fx", "kr_stock", "rate", "world_stock", "trend"} for series in SERIES_BY_CODE.values())
    assert all(series.cycle in {"D", "M"} for series in SERIES_BY_CODE.values())

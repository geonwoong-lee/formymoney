from datetime import date
from decimal import Decimal

from fastapi.testclient import TestClient

from app.collectors.ecos import SERIES, SERIES_BY_CODE
from app.collectors.fred import FredError, fetch_fred, parse_csv
from app.core.config import Settings
from app.services import daily_jobs
from app.services.daily_jobs import fetch_any_series, run_market_job
from app.services.knowledge_base import build_documents
from app.services.market_service import MarketService

CSV = "observation_date,NASDAQCOM\n2026-10-30,25437.000\n2026-10-31,.\n2026-11-02,25164.360\n"


def test_csv_rows_become_dated_values_and_a_holiday_dot_is_skipped() -> None:
    assert parse_csv(CSV) == [("20261030", Decimal("25437.000")), ("20261102", Decimal("25164.360"))]
    assert parse_csv("observation_date,X\n") == []
    assert parse_csv("<html>blocked</html>") == []


def test_us_index_series_come_from_fred_and_the_rest_from_ecos() -> None:
    fred = [series for series in SERIES if series.source == "fred"]

    assert {series.code for series in fred} == {"us_nasdaq", "us_sp500", "us_dow"}
    assert all(series.group == "us_stock" and series.cycle == "D" for series in fred)
    assert SERIES_BY_CODE["usd_krw"].source == "ecos"


def test_fetching_an_empty_or_unreachable_series_is_an_error_not_silent(monkeypatch) -> None:
    class Response:
        def __init__(self, body: bytes) -> None:
            self.body = body

        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self) -> bytes:
            return self.body

    monkeypatch.setattr("app.collectors.fred.urlopen", lambda *_args, **_kw: Response(CSV.encode()))
    assert fetch_fred("NASDAQCOM", date(2026, 11, 4))[-1] == ("20261102", Decimal("25164.360"))
    monkeypatch.setattr("app.collectors.fred.urlopen", lambda *_args, **_kw: Response(b"observation_date,X\n"))
    try:
        fetch_fred("NASDAQCOM", date(2026, 11, 4))
    except FredError as error:
        assert "읽을 수 있는 값이 없습니다" in str(error)
    else:
        raise AssertionError("an empty download must raise")


def test_the_job_routes_each_series_to_its_source(monkeypatch) -> None:
    calls: list[tuple[str, str]] = []
    monkeypatch.setattr(daily_jobs, "fetch_fred", lambda series_id, today: calls.append(("fred", series_id)) or [("20261102", Decimal("25164.36"))])
    monkeypatch.setattr(daily_jobs, "fetch_series", lambda key, series, today: calls.append(("ecos", series.code)) or [("20261030", Decimal("1"))])

    fetch_any_series("key", SERIES_BY_CODE["us_nasdaq"], date(2026, 11, 4))
    fetch_any_series("key", SERIES_BY_CODE["usd_krw"], date(2026, 11, 4))

    assert calls == [("fred", "NASDAQCOM"), ("ecos", "usd_krw")]


def test_us_closes_show_as_their_own_group_with_their_own_source_and_reach_the_assistant(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        service = MarketService(session)
        service.save("us_nasdaq", [("20261030", Decimal("25437.00")), ("20261102", Decimal("25164.36"))])
        result = run_market_job(Settings(_env_file=None, ecos_api_key="x"), session, lambda *_: [])
        snapshot = service.snapshot()
        documents = {doc.key: doc for doc in build_documents(session, date(2026, 11, 4))}

    assert result.status in {"success", "partial"}
    group = next(group for group in snapshot.groups if group.key == "us_stock")
    assert group.title == "미국 증시" and "FRED" in group.note
    item = group.items[0]
    assert (item.name, item.period, item.value) == ("나스닥 종합지수", "20261102", Decimal("25164.36"))
    assert item.change == Decimal("-272.64")
    body = documents["market:us_nasdaq"].content
    assert "2026년 11월 2일 기준 25164.36pt" in body and "FRED" in body and "ECOS" not in body

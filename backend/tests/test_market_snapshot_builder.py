from datetime import date

import pytest

from scripts.build_market_snapshot import ASSETS, MONTH_COUNT, build_snapshot, completed_month_window


def test_completed_window_uses_last_finished_month() -> None:
    window = completed_month_window(date(2026, 10, 29))

    assert window.start_month == "2023-10"
    assert window.end_month == "2026-09"
    assert window.source_date == "2026-09-30"
    assert len(window.months) == MONTH_COUNT


def test_snapshot_uses_the_same_rolling_months_for_every_asset() -> None:
    def chart_loader(symbol: str, window: object) -> dict[str, float]:
        return {month: float(index + 1) for index, month in enumerate(window.months)}

    snapshot = build_snapshot(date(2026, 10, 29), chart_loader)

    assert len(snapshot["assets"]) == len(ASSETS)
    assert all(len(asset["points"]) == MONTH_COUNT for asset in snapshot["assets"])
    assert {asset["source_date"] for asset in snapshot["assets"]} == {"2026-09-30"}
    kosdaq = next(asset for asset in snapshot["assets"] if asset["code"] == "kosdaq150")
    assert {point["usd_krw"] for point in kosdaq["points"]} == {1}


def test_snapshot_rejects_a_missing_month_before_database_write() -> None:
    def chart_loader(symbol: str, window: object) -> dict[str, float]:
        months = window.months[:-1] if symbol == "QQQ" else window.months
        return {month: 1.0 for month in months}

    with pytest.raises(RuntimeError, match="QQQ: missing months: 2026-09"):
        build_snapshot(date(2026, 10, 29), chart_loader)

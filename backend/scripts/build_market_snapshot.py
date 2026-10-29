"""Build and validate a rolling 36-month ETF and USD/KRW snapshot."""

from __future__ import annotations

import argparse
import json
from collections.abc import Callable
from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from pathlib import Path
from typing import Any
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


MONTH_COUNT = 36
OUTPUT = Path(__file__).resolve().parents[1] / "app" / "data" / "investment_market_snapshot.json"

ASSETS = [
    {
        "code": "nasdaq100", "ticker": "QQQ", "name": "Invesco QQQ",
        "category": "nasdaq_100", "currency": "USD", "benchmark": "Nasdaq-100 Index",
        "expense_ratio_percent": 0.18, "leveraged": False,
        "provider_source_url": "https://www.invesco.com/qqq-etf/en/home.html",
        "warning": "주식형 ETF로 원금 손실과 환율 변동 가능성이 있습니다.",
    },
    {
        "code": "schd", "ticker": "SCHD", "name": "Schwab U.S. Dividend Equity ETF",
        "category": "dividend_equity", "currency": "USD",
        "benchmark": "Dow Jones U.S. Dividend 100 Index", "expense_ratio_percent": 0.06,
        "leveraged": False, "provider_source_url": "https://www.schwabassetmanagement.com/products/schd",
        "warning": "배당을 지급하더라도 가격 하락과 환율 변동으로 손실이 날 수 있습니다.",
    },
    {
        "code": "qld", "ticker": "QLD", "name": "ProShares Ultra QQQ",
        "category": "leveraged_nasdaq_100", "currency": "USD",
        "benchmark": "2x daily Nasdaq-100 Index", "expense_ratio_percent": 0.95,
        "leveraged": True,
        "provider_source_url": "https://www.proshares.com/our-etfs/leveraged-and-inverse/qld",
        "warning": "하루 수익률 2배를 목표로 하는 레버리지 ETF입니다. 장기 결과는 QQQ의 단순 2배가 아니며 손실과 변동성 끌림이 확대될 수 있습니다.",
    },
    {
        "code": "bond", "ticker": "BND", "name": "Vanguard Total Bond Market ETF",
        "category": "us_investment_grade_bond", "currency": "USD",
        "benchmark": "Bloomberg U.S. Aggregate Float Adjusted Index", "expense_ratio_percent": 0.03,
        "leveraged": False,
        "provider_source_url": "https://investor.vanguard.com/investment-products/etfs/profile/bnd",
        "warning": "채권 ETF도 금리·신용·환율 변화에 따라 가격이 하락할 수 있습니다.",
    },
    {
        "code": "kosdaq150", "ticker": "229200.KS", "name": "KODEX 코스닥150",
        "category": "korean_equity", "currency": "KRW", "benchmark": "KOSDAQ 150 Index",
        "expense_ratio_percent": 0.25, "leveraged": False,
        "provider_source_url": "https://www.samsungfund.com/etf/product/list.do",
        "warning": "코스닥 전체지수가 아니라 코스닥 대표 150종목을 추종하는 ETF입니다. 높은 가격 변동과 원금 손실 가능성이 있습니다.",
    },
]


@dataclass(frozen=True)
class CalendarWindow:
    start_month: str
    end_month: str
    source_date: str
    period_start: int
    period_end: int
    months: tuple[str, ...]


def completed_month_window(as_of: date | None = None) -> CalendarWindow:
    today = as_of or date.today()
    current_month = date(today.year, today.month, 1)
    completed_date = current_month - timedelta(days=1)
    end_index = completed_date.year * 12 + completed_date.month - 1
    start_index = end_index - (MONTH_COUNT - 1)
    start_year, start_month_zero = divmod(start_index, 12)
    start = date(start_year, start_month_zero + 1, 1)
    months = tuple(_month_at(start, offset) for offset in range(MONTH_COUNT))
    return CalendarWindow(
        start_month=months[0], end_month=months[-1], source_date=completed_date.isoformat(),
        period_start=int(datetime(start.year, start.month, 1, tzinfo=UTC).timestamp()),
        period_end=int(datetime(current_month.year, current_month.month, 1, tzinfo=UTC).timestamp()),
        months=months,
    )


def _month_at(start: date, offset: int) -> str:
    index = start.year * 12 + start.month - 1 + offset
    year, month_zero = divmod(index, 12)
    return f"{year:04d}-{month_zero + 1:02d}"


def fetch_chart(symbol: str, window: CalendarWindow) -> dict[str, float]:
    encoded = quote(symbol, safe="")
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}"
        f"?period1={window.period_start}&period2={window.period_end}&interval=1mo&events=div%2Csplits"
    )
    request = Request(url, headers={"User-Agent": "Very-Rich-market-snapshot/1.0"})
    with urlopen(request, timeout=30) as response:  # noqa: S310 - fixed HTTPS host
        payload = json.load(response)
    result = payload["chart"]["result"][0]
    values = result["indicators"]["adjclose"][0]["adjclose"]
    timezone = ZoneInfo(result["meta"]["exchangeTimezoneName"])
    output: dict[str, float] = {}
    for timestamp, value in zip(result["timestamp"], values, strict=True):
        if value is None:
            continue
        month = datetime.fromtimestamp(timestamp, UTC).astimezone(timezone).strftime("%Y-%m")
        if window.start_month <= month <= window.end_month:
            output[month] = round(float(value), 6)
    return output


def build_snapshot(
    as_of: date | None = None,
    chart_loader: Callable[[str, CalendarWindow], dict[str, float]] = fetch_chart,
) -> dict[str, Any]:
    window = completed_month_window(as_of)
    fx = chart_loader("KRW=X", window)
    records: list[dict[str, Any]] = []
    for asset in ASSETS:
        prices = chart_loader(str(asset["ticker"]), window)
        is_krw = asset["currency"] == "KRW"
        available = set(prices) if is_krw else set(prices) & set(fx)
        missing = [month for month in window.months if month not in available]
        if missing:
            raise RuntimeError(f"{asset['ticker']}: missing months: {', '.join(missing)}")
        records.append({
            **asset,
            "distribution_policy": "adjusted_close_reinvestment",
            "price_source_url": f"https://finance.yahoo.com/quote/{asset['ticker']}/history/",
            "fx_source_url": "" if is_krw else "https://finance.yahoo.com/quote/KRW=X/history/",
            "source_date": window.source_date,
            "points": [
                {"month": month, "adjusted_close": prices[month], "usd_krw": 1 if is_krw else fx[month]}
                for month in window.months
            ],
        })
    snapshot: dict[str, Any] = {"assets": records}
    validate_snapshot(snapshot, window)
    return snapshot


def validate_snapshot(snapshot: dict[str, Any], window: CalendarWindow | None = None) -> None:
    assets = snapshot.get("assets")
    if not isinstance(assets, list) or len(assets) != len(ASSETS):
        raise RuntimeError(f"expected {len(ASSETS)} assets")
    expected_codes = {str(asset["code"]) for asset in ASSETS}
    if {str(asset.get("code")) for asset in assets} != expected_codes:
        raise RuntimeError("asset codes do not match the supported set")
    expected_months = list(window.months) if window else None
    for asset in assets:
        points = asset.get("points")
        if not isinstance(points, list) or len(points) != MONTH_COUNT:
            raise RuntimeError(f"{asset.get('ticker')}: expected {MONTH_COUNT} points")
        months = [point.get("month") for point in points]
        if len(set(months)) != MONTH_COUNT or months != sorted(months):
            raise RuntimeError(f"{asset.get('ticker')}: months are duplicated or out of order")
        if expected_months and months != expected_months:
            raise RuntimeError(f"{asset.get('ticker')}: month range does not match the requested window")
        if any(float(point.get("adjusted_close", 0)) <= 0 or float(point.get("usd_krw", 0)) <= 0 for point in points):
            raise RuntimeError(f"{asset.get('ticker')}: price and exchange rate must be positive")


def write_snapshot(snapshot: dict[str, Any], output: Path = OUTPUT) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(snapshot, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--as-of", type=date.fromisoformat, help="Reference date in YYYY-MM-DD format")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    snapshot = build_snapshot(args.as_of)
    write_snapshot(snapshot, args.output)
    point_count = sum(len(asset["points"]) for asset in snapshot["assets"])
    print(f"Validated and wrote {len(snapshot['assets'])} assets and {point_count} points")


if __name__ == "__main__":
    main()

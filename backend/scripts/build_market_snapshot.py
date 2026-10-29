"""Build the checked-in 36-month ETF and USD/KRW market-data snapshot."""

from __future__ import annotations

import json
from datetime import UTC, datetime
from pathlib import Path
from urllib.parse import quote
from urllib.request import Request, urlopen
from zoneinfo import ZoneInfo


START_MONTH = "2023-10"
END_MONTH = "2026-09"
PERIOD_START = 1_696_118_400  # 2023-10-01 UTC
PERIOD_END = 1_790_812_800  # 2026-10-01 UTC, exclusive
OUTPUT = Path(__file__).resolve().parents[1] / "app" / "data" / "investment_market_snapshot.json"

ASSETS = [
    {
        "code": "nasdaq100",
        "ticker": "QQQ",
        "name": "Invesco QQQ",
        "category": "nasdaq_100",
        "currency": "USD",
        "benchmark": "Nasdaq-100 Index",
        "expense_ratio_percent": 0.18,
        "leveraged": False,
        "provider_source_url": "https://www.invesco.com/qqq-etf/en/home.html",
        "warning": "주식형 ETF로 원금 손실과 환율 변동 가능성이 있습니다.",
    },
    {
        "code": "schd",
        "ticker": "SCHD",
        "name": "Schwab U.S. Dividend Equity ETF",
        "category": "dividend_equity",
        "currency": "USD",
        "benchmark": "Dow Jones U.S. Dividend 100 Index",
        "expense_ratio_percent": 0.06,
        "leveraged": False,
        "provider_source_url": "https://www.schwabassetmanagement.com/products/schd",
        "warning": "배당을 지급하더라도 가격 하락과 환율 변동으로 손실이 날 수 있습니다.",
    },
    {
        "code": "qld",
        "ticker": "QLD",
        "name": "ProShares Ultra QQQ",
        "category": "leveraged_nasdaq_100",
        "currency": "USD",
        "benchmark": "2x daily Nasdaq-100 Index",
        "expense_ratio_percent": 0.95,
        "leveraged": True,
        "provider_source_url": "https://www.proshares.com/our-etfs/leveraged-and-inverse/qld",
        "warning": "하루 수익률 2배를 목표로 하는 레버리지 ETF입니다. 장기 결과는 QQQ의 단순 2배가 아니며 손실과 변동성 끌림이 확대될 수 있습니다.",
    },
    {
        "code": "bond",
        "ticker": "BND",
        "name": "Vanguard Total Bond Market ETF",
        "category": "us_investment_grade_bond",
        "currency": "USD",
        "benchmark": "Bloomberg U.S. Aggregate Float Adjusted Index",
        "expense_ratio_percent": 0.03,
        "leveraged": False,
        "provider_source_url": "https://investor.vanguard.com/investment-products/etfs/profile/bnd",
        "warning": "채권 ETF도 금리·신용·환율 변화에 따라 가격이 하락할 수 있습니다.",
    },
    {
        "code": "kosdaq150",
        "ticker": "229200.KS",
        "name": "KODEX 코스닥150",
        "category": "korean_equity",
        "currency": "KRW",
        "benchmark": "KOSDAQ 150 Index",
        "expense_ratio_percent": 0.25,
        "leveraged": False,
        "provider_source_url": "https://www.samsungfund.com/etf/product/list.do",
        "warning": "코스닥 전체지수가 아니라 코스닥 대표 150종목을 추종하는 ETF입니다. 높은 가격 변동과 원금 손실 가능성이 있습니다.",
    },
]


def _chart(symbol: str) -> dict[str, float]:
    encoded = quote(symbol, safe="")
    url = (
        f"https://query1.finance.yahoo.com/v8/finance/chart/{encoded}"
        f"?period1={PERIOD_START}&period2={PERIOD_END}&interval=1mo&events=div%2Csplits"
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
        if START_MONTH <= month <= END_MONTH:
            output[month] = round(float(value), 6)
    return output


def main() -> None:
    fx = _chart("KRW=X")
    expected_months = 36
    records = []
    for asset in ASSETS:
        prices = _chart(asset["ticker"])
        is_krw = asset["currency"] == "KRW"
        common_months = sorted(set(prices) if is_krw else set(prices) & set(fx))
        if len(common_months) != expected_months:
            raise RuntimeError(f"{asset['ticker']}: expected 36 common months, got {len(common_months)}")
        records.append({
            **asset,
            "distribution_policy": "adjusted_close_reinvestment",
            "price_source_url": f"https://finance.yahoo.com/quote/{asset['ticker']}/history/",
            "fx_source_url": "" if is_krw else "https://finance.yahoo.com/quote/KRW=X/history/",
            "source_date": "2026-09-30",
            "points": [
                {"month": month, "adjusted_close": prices[month], "usd_krw": 1 if is_krw else fx[month]}
                for month in common_months
            ],
        })
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps({"assets": records}, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(records)} assets and {sum(len(item['points']) for item in records)} points")


if __name__ == "__main__":
    main()

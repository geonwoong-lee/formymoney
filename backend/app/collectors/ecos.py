"""Bank of Korea ECOS (경제통계시스템) Open API client for the market tab.

Only published statistics are used: exchange rates, KOSPI/KOSDAQ closes, policy and market rates,
ECOS's monthly international stock index table and the consumer price index (국가데이터처, via ECOS). Values are daily or monthly, never real time.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import urlopen

ECOS_URL = "https://ecos.bok.or.kr/api/StatisticSearch"
NO_DATA_CODE = "INFO-200"


DAILY_LOOKBACK_DAYS = 20
MONTHLY_LOOKBACK_MONTHS = 26


class EcosError(RuntimeError):
    pass


@dataclass(frozen=True)
class Series:
    code: str
    group: str  # fx | kr_stock | rate | world_stock | trend | price_index
    name: str
    stat_code: str
    cycle: str  # D (daily) or M (monthly)
    item_code: str
    unit: str
    lookback_months: int = MONTHLY_LOOKBACK_MONTHS


SERIES: list[Series] = [
    Series("usd_krw", "fx", "원/달러", "731Y001", "D", "0000001", "원"),
    Series("jpy_krw", "fx", "원/100엔", "731Y001", "D", "0000002", "원"),
    Series("eur_krw", "fx", "원/유로", "731Y001", "D", "0000003", "원"),
    Series("cny_krw", "fx", "원/위안", "731Y001", "D", "0000053", "원"),
    Series("kospi", "kr_stock", "코스피", "802Y001", "D", "0001000", "pt"),
    Series("kosdaq", "kr_stock", "코스닥", "802Y001", "D", "0089000", "pt"),
    Series("base_rate", "rate", "한국은행 기준금리", "722Y001", "D", "0101000", "%"),
    Series("ktb_3y", "rate", "국고채 3년", "817Y002", "D", "010200000", "%"),
    Series("deposit_rate", "rate", "은행 예금 평균금리(신규)", "121Y002", "M", "BEABAA2", "%"),
    Series("world_usa", "world_stock", "미국", "902Y002", "M", "USA", "2015=100"),
    Series("world_jpn", "world_stock", "일본", "902Y002", "M", "JPN", "2015=100"),
    Series("world_chn", "world_stock", "중국", "902Y002", "M", "CHN", "2015=100"),
    Series("world_deu", "world_stock", "독일", "902Y002", "M", "DEU", "2015=100"),
    Series("world_gbr", "world_stock", "영국", "902Y002", "M", "GBR", "2015=100"),
    Series("base_rate_monthly", "trend", "한국은행 기준금리(월)", "722Y001", "M", "0101000", "%"),
    # The index itself is not shown; the market tab turns it into the year-on-year rise (24 months need 36+).
    Series("cpi_index", "price_index", "소비자물가지수(2020=100)", "901Y009", "M", "0", "2020=100", 40),
]
SERIES_BY_CODE = {series.code: series for series in SERIES}


def request_window(cycle: str, today: date, lookback_months: int = MONTHLY_LOOKBACK_MONTHS) -> tuple[str, str]:
    if cycle == "D":
        return (today - timedelta(days=DAILY_LOOKBACK_DAYS)).strftime("%Y%m%d"), today.strftime("%Y%m%d")
    months = today.year * 12 + today.month - 1 - lookback_months
    return f"{months // 12}{months % 12 + 1:02d}", today.strftime("%Y%m")


def parse_rows(payload: dict[str, object]) -> list[tuple[str, Decimal]]:
    result = payload.get("RESULT")
    if isinstance(result, dict):
        if result.get("CODE") == NO_DATA_CODE:
            return []
        raise EcosError(f"ECOS 오류 {result.get('CODE')}: {result.get('MESSAGE')}")
    body = payload.get("StatisticSearch")
    rows = body.get("row", []) if isinstance(body, dict) else []
    points: list[tuple[str, Decimal]] = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        period = str(row.get("TIME", ""))
        try:
            value = Decimal(str(row.get("DATA_VALUE", "")).replace(",", ""))
        except InvalidOperation:
            continue
        if period.isdigit() and len(period) in (6, 8) and value.is_finite():
            points.append((period, value))
    return points


def fetch_series(api_key: str, series: Series, today: date, max_rows: int = 1000) -> list[tuple[str, Decimal]]:
    start, end = request_window(series.cycle, today, series.lookback_months)
    url = (
        f"{ECOS_URL}/{quote(api_key)}/json/kr/1/{max_rows}/"
        f"{series.stat_code}/{series.cycle}/{start}/{end}/{series.item_code}"
    )
    try:
        with urlopen(url, timeout=20) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise EcosError(f"ECOS 응답 오류(HTTP {error.code})") from error
    except (URLError, TimeoutError, ValueError) as error:
        raise EcosError("ECOS에 연결하지 못했습니다.") from error
    return parse_rows(payload)

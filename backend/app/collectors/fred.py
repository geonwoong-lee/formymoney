"""Daily index closes from FRED, the Federal Reserve Bank of St. Louis data service.

The public CSV download needs no key. FRED publishes a US index close about a day after the trading day, so the latest
value is the previous trading day's close, never a live quote.
"""

from __future__ import annotations

from datetime import date, timedelta
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from app.collectors.ecos import EcosError

FRED_URL = "https://fred.stlouisfed.org/graph/fredgraph.csv"
LOOKBACK_DAYS = 20


class FredError(EcosError):
    pass


def parse_csv(text: str) -> list[tuple[str, Decimal]]:
    """(YYYYMMDD, value) rows. FRED writes a missing day (a holiday) as ".", which is skipped."""
    points: list[tuple[str, Decimal]] = []
    for line in text.splitlines()[1:]:
        day, _, raw = line.partition(",")
        day, raw = day.strip(), raw.strip()
        if len(day) != 10 or day[4] != "-" or day[7] != "-":
            continue
        try:
            value = Decimal(raw)
        except InvalidOperation:
            continue
        if value.is_finite():
            points.append((day.replace("-", ""), value))
    return points


def fetch_fred(series_id: str, today: date) -> list[tuple[str, Decimal]]:
    query = urlencode({"id": series_id, "cosd": (today - timedelta(days=LOOKBACK_DAYS)).isoformat()})
    try:
        with urlopen(f"{FRED_URL}?{query}", timeout=30) as response:
            text = response.read().decode("utf-8")
    except HTTPError as error:
        raise FredError(f"FRED 응답 오류(HTTP {error.code})") from error
    except (URLError, TimeoutError, ValueError) as error:
        raise FredError("FRED에 연결하지 못했습니다.") from error
    points = parse_csv(text)
    if not points:
        raise FredError(f"FRED {series_id}에서 읽을 수 있는 값이 없습니다.")
    return points

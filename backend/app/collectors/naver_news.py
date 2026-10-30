"""Collect title-and-link headlines from the Naver news search API.

Only the title, publisher host, link and publish time are kept. The snippet and any article
text are discarded, and rows expire (see HEADLINE_RETENTION_DAYS) to respect the API terms.
"""

from __future__ import annotations

import html
import json
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.parse import quote, urlsplit
from urllib.request import Request, urlopen

from app.core.config import Settings

DEVELOPERS_URL = "https://openapi.naver.com/v1/search/news.json"
HUB_URL = "https://naverapihub.apigw.ntruss.com/search/v1/news"
TAG_PATTERN = re.compile(r"<[^>]+>")


class NaverNewsError(RuntimeError):
    pass


@dataclass(frozen=True)
class Headline:
    title: str
    publisher: str
    url: str
    published_at: datetime


def _request_target(settings: Settings, query: str, display: int) -> tuple[str, dict[str, str]]:
    suffix = f"?query={quote(query)}&display={display}&sort=date"
    if settings.naver_hub_key_id and settings.naver_hub_key:
        return HUB_URL + suffix, {
            "X-NCP-APIGW-API-KEY-ID": settings.naver_hub_key_id,
            "X-NCP-APIGW-API-KEY": settings.naver_hub_key,
        }
    if settings.naver_client_id and settings.naver_client_secret:
        return DEVELOPERS_URL + suffix, {
            "X-Naver-Client-Id": settings.naver_client_id,
            "X-Naver-Client-Secret": settings.naver_client_secret,
        }
    raise NaverNewsError("네이버 API 키가 설정되지 않았습니다. backend/.env를 확인해 주세요.")


def clean_title(raw: str) -> str:
    return " ".join(html.unescape(TAG_PATTERN.sub("", raw)).split())


def parse_items(payload: dict[str, object]) -> list[Headline]:
    headlines: list[Headline] = []
    for item in payload.get("items", []) or []:
        if not isinstance(item, dict):
            continue
        url = str(item.get("originallink") or item.get("link") or "").strip()
        parts = urlsplit(url)
        if parts.scheme not in {"http", "https"} or not parts.hostname:
            continue
        title = clean_title(str(item.get("title", "")))
        try:
            published_at = parsedate_to_datetime(str(item.get("pubDate", "")))
        except (TypeError, ValueError):
            continue
        if not title:
            continue
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        host = parts.hostname.removeprefix("www.")
        headlines.append(Headline(title=title[:500], publisher=host, url=url[:1000], published_at=published_at))
    return headlines


def fetch_headlines(settings: Settings, query: str, display: int = 20) -> list[Headline]:
    url, headers = _request_target(settings, query, display)
    try:
        with urlopen(Request(url, headers=headers), timeout=15) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise NaverNewsError(f"네이버 뉴스 API 응답 오류(HTTP {error.code})") from error
    except (URLError, TimeoutError, ValueError) as error:
        raise NaverNewsError("네이버 뉴스 API에 연결하지 못했습니다.") from error
    return parse_items(payload)

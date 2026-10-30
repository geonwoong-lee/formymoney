"""Collect title-and-link headlines from official central bank RSS feeds.

Federal Reserve Board: website content is public domain, citing the Board is requested.
European Central Bank: free use if reproduced accurately and the ECB is cited as the source.
Titles are kept in the original language and never rewritten.
"""

from __future__ import annotations

import xml.etree.ElementTree as ET
from dataclasses import dataclass
from datetime import timezone
from email.utils import parsedate_to_datetime
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from app.collectors.naver_news import Headline


class OfficialRssError(RuntimeError):
    pass


@dataclass(frozen=True)
class OfficialFeed:
    code: str
    publisher: str
    host: str
    url: str


OFFICIAL_FEEDS = [
    OfficialFeed("fed_press", "Federal Reserve Board", "www.federalreserve.gov", "https://www.federalreserve.gov/feeds/press_all.xml"),
    OfficialFeed("ecb_press", "European Central Bank", "www.ecb.europa.eu", "https://www.ecb.europa.eu/rss/press.html"),
]


def parse_feed(feed: OfficialFeed, xml_text: str) -> list[Headline]:
    try:
        root = ET.fromstring(xml_text.lstrip("﻿"))
    except ET.ParseError as error:
        raise OfficialRssError(f"{feed.publisher} RSS를 읽지 못했습니다.") from error
    headlines: list[Headline] = []
    for item in root.iter("item"):
        title = " ".join((item.findtext("title") or "").split())
        link = (item.findtext("link") or "").strip()
        parts = urlsplit(link)
        if not title or parts.scheme != "https" or parts.hostname != feed.host:
            continue
        try:
            published_at = parsedate_to_datetime((item.findtext("pubDate") or "").strip())
        except (TypeError, ValueError):
            continue
        if published_at.tzinfo is None:
            published_at = published_at.replace(tzinfo=timezone.utc)
        headlines.append(Headline(title=title[:500], publisher=feed.publisher, url=link[:1000], published_at=published_at))
    return headlines


def fetch_feed(feed: OfficialFeed) -> list[Headline]:
    request = Request(feed.url, headers={"User-Agent": "VeryRichBot/1.0 (headline links only)"})
    try:
        with urlopen(request, timeout=20) as response:
            return parse_feed(feed, response.read().decode("utf-8"))
    except (HTTPError, URLError, TimeoutError, UnicodeDecodeError) as error:
        raise OfficialRssError(f"{feed.publisher} RSS에 연결하지 못했습니다.") from error

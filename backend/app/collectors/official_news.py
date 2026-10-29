from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, timezone
from email.utils import parsedate_to_datetime
import hashlib
import time
from typing import Callable
from urllib.parse import parse_qs, urljoin, urlsplit
import xml.etree.ElementTree as ET

from lxml import html
from scrapling.fetchers import Fetcher

from app.data.daily_sources import DAILY_SOURCE_POLICIES


USER_AGENT = "VeryRichResearchBot/0.1 (+local portfolio project)"
MAX_RESPONSE_BYTES = 2_000_000
MAX_EVIDENCE_PARAGRAPHS = 12
MAX_EVIDENCE_PARAGRAPH_CHARS = 2_000
MAX_EVIDENCE_TOTAL_CHARS = 16_000


class OfficialCollectionError(RuntimeError):
    pass


@dataclass(frozen=True)
class CollectedCandidate:
    source_code: str
    source_item_id: str
    original_title: str
    canonical_url: str
    published_at: datetime


@dataclass(frozen=True)
class SourceCollectionResult:
    source_code: str
    status: str
    candidates: tuple[CollectedCandidate, ...]
    detail: str


@dataclass(frozen=True)
class CollectionBatch:
    results: tuple[SourceCollectionResult, ...]


@dataclass(frozen=True)
class CollectedEvidence:
    fetched_at: datetime
    content_sha256: str
    paragraphs: tuple[str, ...]


FetchBytes = Callable[[str], tuple[bytes, str]]


def _fetch_bytes(url: str) -> tuple[bytes, str]:
    response = Fetcher.get(
        url,
        timeout=15,
        retries=1,
        retry_delay=2,
        follow_redirects="safe",
        stealthy_headers=False,
        impersonate=None,
        headers={"User-Agent": USER_AGENT, "Accept": "application/rss+xml, application/xml, text/html"},
    )
    if response.status != 200:
        raise OfficialCollectionError(f"official source returned HTTP {response.status}")
    if len(response.body) > MAX_RESPONSE_BYTES:
        raise OfficialCollectionError("official response exceeded the size limit")
    return response.body, str(response.url)


def _source_item_id(link: str, guid: str = "") -> str:
    query = parse_qs(urlsplit(link).query)
    for key in ("nttId", "id", "no"):
        if query.get(key):
            return query[key][0][:255]
    path_id = urlsplit(link).path.rstrip("/").split("/")[-1]
    return (guid or path_id or link)[:255]


def _parse_rss(body: bytes, source_code: str, target_date: date) -> tuple[CollectedCandidate, ...]:
    root = ET.fromstring(body)
    candidates: list[CollectedCandidate] = []
    for item in root.findall(".//item"):
        title = (item.findtext("title") or "").strip()
        link = (item.findtext("link") or "").strip()
        guid = (item.findtext("guid") or "").strip()
        published_text = (item.findtext("pubDate") or "").strip()
        if not title or not link or not published_text:
            continue
        try:
            published_at = parsedate_to_datetime(published_text)
        except (TypeError, ValueError):
            continue
        if published_at.date() != target_date:
            continue
        candidates.append(
            CollectedCandidate(
                source_code=source_code,
                source_item_id=_source_item_id(link, guid),
                original_title=title,
                canonical_url=link,
                published_at=published_at,
            )
        )
    return tuple(candidates)


def _parse_fsc_listing(body: bytes, target_date: date) -> tuple[CollectedCandidate, ...]:
    document = html.fromstring(body.decode("utf-8"))
    candidates: list[CollectedCandidate] = []
    seen: set[str] = set()
    for anchor in document.xpath("//a[contains(@href, '/no010101/')]"):
        href = (anchor.get("href") or "").strip()
        if not href or href in seen:
            continue
        item_nodes = anchor.xpath("ancestor::li[1]")
        if not item_nodes:
            continue
        date_text = "".join(
            item_nodes[0].xpath(
                ".//div[contains(concat(' ', normalize-space(@class), ' '), ' day ')]//text()"
            )
        ).strip()
        try:
            published_date = date.fromisoformat(date_text)
        except ValueError:
            continue
        if published_date != target_date:
            continue
        title = " ".join(anchor.text_content().split())
        canonical_url = urljoin("https://www.fsc.go.kr", href)
        seen.add(href)
        candidates.append(
            CollectedCandidate(
                source_code="fsc_press",
                source_item_id=urlsplit(canonical_url).path.rstrip("/").split("/")[-1],
                original_title=title,
                canonical_url=canonical_url,
                published_at=datetime.fromisoformat(f"{published_date.isoformat()}T00:00:00+09:00"),
            )
        )
    return tuple(candidates)


def _clean_paragraphs(body: bytes) -> tuple[str, ...]:
    try:
        document = html.fromstring(body.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as error:
        raise OfficialCollectionError("official detail page was not valid UTF-8 HTML") from error

    nodes = document.cssselect(".board-view-wrap .body .cont p")
    if not nodes:
        nodes = document.cssselect(".board-view-wrap .body p")

    paragraphs: list[str] = []
    total_chars = 0
    for node in nodes:
        text = " ".join(node.text_content().split())
        if len(text) < 10:
            continue
        text = text[:MAX_EVIDENCE_PARAGRAPH_CHARS]
        if total_chars + len(text) > MAX_EVIDENCE_TOTAL_CHARS:
            break
        paragraphs.append(text)
        total_chars += len(text)
        if len(paragraphs) >= MAX_EVIDENCE_PARAGRAPHS:
            break
    if not paragraphs:
        raise OfficialCollectionError("official detail page did not contain summary evidence")
    return tuple(paragraphs)


def collect_candidate_evidence(
    candidate: CollectedCandidate,
    fetch_bytes: FetchBytes | None = None,
) -> CollectedEvidence:
    policy = DAILY_SOURCE_POLICIES.get(candidate.source_code)
    if policy is None or not policy["summary_allowed"]:
        raise OfficialCollectionError("source is not allowed for AI summaries")

    requested = urlsplit(candidate.canonical_url)
    if (
        requested.scheme != "https"
        or requested.hostname != policy["allowed_host"]
        or not requested.path.startswith(str(policy["allowed_path_prefix"]))
    ):
        raise OfficialCollectionError("candidate URL is outside the allowed official path")

    fetch = fetch_bytes or _fetch_bytes
    try:
        body, final_url = fetch(candidate.canonical_url)
    except OfficialCollectionError:
        raise
    except Exception as error:
        raise OfficialCollectionError("official detail page could not be read") from error
    final = urlsplit(final_url)
    if final.hostname != policy["allowed_host"] or not final.path.startswith(str(policy["allowed_path_prefix"])):
        raise OfficialCollectionError("official detail page redirected outside the allowed path")

    paragraphs = _clean_paragraphs(body)
    normalized = "\n".join(paragraphs).encode("utf-8")
    return CollectedEvidence(
        fetched_at=datetime.now(timezone.utc),
        content_sha256=hashlib.sha256(normalized).hexdigest(),
        paragraphs=paragraphs,
    )


def collect_official_candidates(
    target_date: date,
    fetch_bytes: FetchBytes | None = None,
    fallback_delay: Callable[[float], None] = time.sleep,
) -> CollectionBatch:
    fetch = fetch_bytes or _fetch_bytes
    results: list[SourceCollectionResult] = []

    fsc_policy = DAILY_SOURCE_POLICIES["fsc_press"]
    try:
        body, final_url = fetch(str(fsc_policy["feed_url"]))
        if urlsplit(final_url).hostname != fsc_policy["allowed_host"]:
            raise OfficialCollectionError("FSC RSS redirected outside the allowed host")
        fsc_candidates = _parse_rss(body, "fsc_press", target_date)
        results.append(SourceCollectionResult("fsc_press", "ok", fsc_candidates, "공식 RSS 확인 완료"))
    except Exception:
        try:
            fallback_delay(2)
            body, final_url = fetch(str(fsc_policy["listing_url"]))
            if urlsplit(final_url).hostname != fsc_policy["allowed_host"]:
                raise OfficialCollectionError("FSC listing redirected outside the allowed host")
            fsc_candidates = _parse_fsc_listing(body, target_date)
            results.append(SourceCollectionResult("fsc_press", "fallback", fsc_candidates, "공식 목록 대체 수집"))
        except Exception:
            results.append(SourceCollectionResult("fsc_press", "failed", (), "금융위원회 공식 자료를 읽지 못했습니다."))

    bok_policy = DAILY_SOURCE_POLICIES["bok_press"]
    try:
        body, final_url = fetch(str(bok_policy["feed_url"]))
        if urlsplit(final_url).hostname != bok_policy["allowed_host"]:
            raise OfficialCollectionError("BOK RSS redirected outside the allowed host")
        bok_candidates = _parse_rss(body, "bok_press", target_date)
        results.append(SourceCollectionResult("bok_press", "ok", bok_candidates, "발견 전용 RSS 확인 완료"))
    except Exception:
        results.append(SourceCollectionResult("bok_press", "failed", (), "한국은행 공식 RSS를 읽지 못했습니다."))

    return CollectionBatch(results=tuple(results))

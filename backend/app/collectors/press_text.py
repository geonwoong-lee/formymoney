"""Read the opening paragraphs of an official press release page (Fed Board / ECB only)."""

from __future__ import annotations

from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from lxml import html

ALLOWED_HOSTS = {"www.federalreserve.gov", "www.ecb.europa.eu"}
MAX_PARAGRAPHS = 8
MAX_CHARACTERS = 4_000
MIN_PARAGRAPH_LENGTH = 40


class PressTextError(RuntimeError):
    pass


def extract_paragraphs(page: str) -> list[str]:
    tree = html.fromstring(page)
    for bad in tree.xpath("//script|//style|//nav|//header|//footer"):
        bad.getparent().remove(bad)
    containers = (
        tree.xpath("//div[@id='article']") or tree.xpath("//main") or tree.xpath("//article") or [tree]
    )
    paragraphs: list[str] = []
    total = 0
    for node in containers[0].iter("p"):
        text = " ".join(node.text_content().split())
        if len(text) < MIN_PARAGRAPH_LENGTH:
            continue
        paragraphs.append(text)
        total += len(text)
        if len(paragraphs) >= MAX_PARAGRAPHS or total >= MAX_CHARACTERS:
            break
    return paragraphs


def fetch_paragraphs(url: str) -> list[str]:
    parts = urlsplit(url)
    if parts.scheme != "https" or parts.hostname not in ALLOWED_HOSTS:
        raise PressTextError("허용되지 않은 출처입니다.")
    request = Request(url, headers={"User-Agent": "VeryRichBot/1.0 (official press releases)"})
    try:
        with urlopen(request, timeout=20) as response:
            page = response.read().decode("utf-8", errors="replace")
    except (HTTPError, URLError, TimeoutError) as error:
        raise PressTextError("공식 원문 페이지를 읽지 못했습니다.") from error
    paragraphs = extract_paragraphs(page)
    if not paragraphs:
        raise PressTextError("원문에서 본문 문단을 찾지 못했습니다.")
    return paragraphs

"""온통청년 청년정책 Open API client (한국고용정보원 · 청년센터).

One call returns up to 1,000 policies, so the whole list (a few thousand) takes a handful of requests. The server
answers 403 "invalid api key" when calls come too fast, so requests are spaced and retried.
"""

from __future__ import annotations

import json
import socket
import time
from dataclasses import dataclass
from datetime import date
from http.client import HTTPSConnection
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPSHandler, Request, build_opener

API_URL = "https://www.youthcenter.go.kr/go/ythip/getPlcy"
PAGE_SIZE = 1000
MAX_PAGES = 12
ATTEMPTS = 4
PAUSE_SECONDS = 1.5
# 법정동 시도 prefix. 12 is the 전남광주통합특별시 that the API uses for the merged 광주·전남.
REGIONS = {
    "11": "서울", "12": "광주·전남", "26": "부산", "27": "대구", "28": "인천", "30": "대전", "31": "울산", "36": "세종",
    "41": "경기", "43": "충북", "44": "충남", "47": "경북", "48": "경남", "50": "제주", "51": "강원", "52": "전북",
}
NATIONWIDE_FROM = 15  # a policy that lists this many regions or more is open everywhere


class YouthPolicyError(RuntimeError):
    pass


@dataclass(frozen=True)
class YouthPolicy:
    policy_no: str
    name: str
    keywords: str
    summary: str
    support: str
    category: str
    subcategory: str
    min_age: int | None
    max_age: int | None
    income_note: str
    extra_conditions: str
    apply_start: date | None
    apply_end: date | None
    apply_method: str
    selection: str
    institution: str
    apply_url: str
    ref_url: str
    regions: str  # comma separated prefixes, "" when the API gave none
    nationwide: bool
    modified_on: date | None


def _text(value: object) -> str:
    return " ".join(str(value or "").split())


def _multiline(value: object) -> str:
    lines = [" ".join(line.split()) for line in str(value or "").replace("\r", "").split("\n")]
    return "\n".join(line for line in lines if line)


def _int(value: object) -> int:
    try:
        return int(str(value).strip())
    except ValueError:
        return 0


def _day(value: object) -> date | None:
    digits = "".join(ch for ch in str(value or "")[:10] if ch.isdigit())
    if len(digits) != 8:
        return None
    try:
        return date(int(digits[:4]), int(digits[4:6]), int(digits[6:]))
    except ValueError:
        return None


def _web_link(value: object) -> str:
    link = str(value or "").strip()
    return link if link.lower().startswith(("http://", "https://")) else ""


def _categories(value: object) -> str:
    return ",".join(dict.fromkeys(part.strip() for part in str(value or "").split(",") if part.strip()))


def parse_policy(item: dict[str, object]) -> YouthPolicy | None:
    policy_no, name = _text(item.get("plcyNo")), _text(item.get("plcyNm"))
    if not policy_no or not name:
        return None
    limited = str(item.get("sprtTrgtAgeLmtYn")).strip() == "Y"
    low, high = _int(item.get("sprtTrgtMinAge")), _int(item.get("sprtTrgtMaxAge"))
    period = str(item.get("aplyYmd") or "").split("~")
    prefixes = list(dict.fromkeys(code.strip()[:2] for code in str(item.get("zipCd") or "").split(",") if len(code.strip()) >= 2))
    return YouthPolicy(
        policy_no=policy_no[:30], name=name[:200], keywords=_text(item.get("plcyKywdNm"))[:300],
        summary=_multiline(item.get("plcyExplnCn")), support=_multiline(item.get("plcySprtCn")),
        category=_categories(item.get("lclsfNm"))[:100], subcategory=_categories(item.get("mclsfNm"))[:150],
        min_age=low if limited and low > 0 else None, max_age=high if limited and high > 0 else None,
        income_note=_multiline(item.get("earnEtcCn")), extra_conditions=_multiline(item.get("addAplyQlfcCndCn")),
        apply_start=_day(period[0]) if len(period) == 2 else None, apply_end=_day(period[1]) if len(period) == 2 else None,
        apply_method=_multiline(item.get("plcyAplyMthdCn")), selection=_multiline(item.get("srngMthdCn")),
        institution=_text(item.get("sprvsnInstCdNm"))[:200], apply_url=_web_link(item.get("aplyUrlAddr")),
        ref_url=_web_link(item.get("refUrlAddr1")), regions=",".join(prefixes)[:80],
        nationwide=len([code for code in prefixes if code in REGIONS]) >= NATIONWIDE_FROM,
        modified_on=_day(item.get("lastMdfcnDt")),
    )


def parse_page(payload: dict[str, object]) -> tuple[list[YouthPolicy], int]:
    if payload.get("resultCode") != 200 or not isinstance(payload.get("result"), dict):
        raise YouthPolicyError(f"온통청년 응답 오류: {payload.get('errorMsg') or payload.get('resultMessage') or '형식이 올바르지 않습니다.'}")
    result = payload["result"]
    items = result.get("youthPolicyList") or []  # type: ignore[union-attr]
    total = _int((result.get("pagging") or {}).get("totCount"))  # type: ignore[union-attr]
    policies = [policy for item in items if isinstance(item, dict) and (policy := parse_policy(item))]
    return policies, total


class _IPv4Connection(HTTPSConnection):
    """This API host does not answer over IPv6 from some networks, so connect over IPv4 only."""

    def connect(self) -> None:
        address = socket.getaddrinfo(self.host, self.port, socket.AF_INET, socket.SOCK_STREAM)[0][4]
        sock = socket.create_connection(address, self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)  # type: ignore[attr-defined]


class _IPv4Handler(HTTPSHandler):
    def https_open(self, req: Request):  # type: ignore[override]
        return self.do_open(_IPv4Connection, req)


_OPENER = build_opener(_IPv4Handler())


def _get(api_key: str, page: int) -> dict[str, object]:
    query = urlencode({"apiKeyNm": api_key, "pageNum": page, "pageSize": PAGE_SIZE, "rtnType": "json"})
    last = "알 수 없는 오류"
    for attempt in range(ATTEMPTS):
        if attempt:
            time.sleep(PAUSE_SECONDS * 2 * attempt)
        try:
            with _OPENER.open(f"{API_URL}?{query}", timeout=40) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            last = f"HTTP {error.code}"
        except (URLError, TimeoutError, OSError, ValueError):
            last = "연결 또는 응답 해석 실패"
    raise YouthPolicyError(f"온통청년 API 요청이 {ATTEMPTS}번 모두 실패했습니다({last}).")


def fetch_youth_policies(api_key: str) -> list[YouthPolicy]:
    """Every policy the API lists. Raises unless all pages arrived, so a partial list never replaces the stored one."""
    policies: list[YouthPolicy] = []
    seen: set[str] = set()
    total = 0
    for page in range(1, MAX_PAGES + 1):
        if page > 1:
            time.sleep(PAUSE_SECONDS)
        found, total = parse_page(_get(api_key, page))
        for policy in found:
            if policy.policy_no not in seen:
                seen.add(policy.policy_no)
                policies.append(policy)
        if not found or page * PAGE_SIZE >= total:
            break
    if not policies or len(policies) < total * 0.98:
        raise YouthPolicyError(f"온통청년 정책을 일부만 받았습니다({len(policies)}/{total}건).")
    return policies

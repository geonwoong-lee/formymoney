"""금융감독원 전자공시(OpenDART) client: compared banks' main accounts and bank/holding company filings.

Main accounts come from the business report (사업보고서, reprt_code 11011) via fnlttSinglAcnt. The bank's own
statement (별도, OFS) is preferred because the savings products belong to the bank; the consolidated one (CFS) is the
fallback. Filings are shown as title, date and a link to the DART viewer only.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from datetime import date
from decimal import Decimal, InvalidOperation
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

API_URL = "https://opendart.fss.or.kr/api"
VIEWER_URL = "https://dart.fss.or.kr/dsaf001/main.do?rcpNo="
BUSINESS_REPORT = "11011"
NO_DATA = "013"

# Site bank code -> DART corp code, checked on 2026-11-03 (each has a 2025 business report with main accounts).
# 농협은행·수협은행 have no main accounts in this API and 우체국 is not a DART filer.
BANK_CORPS: dict[str, tuple[str, str]] = {
    "kb": ("00386937", "국민은행"),
    "shinhan": ("00149293", "신한은행"),
    "hana": ("00158909", "하나은행"),
    "woori": ("00254045", "우리은행"),
    "ibk": ("00149646", "기업은행"),
    "im": ("00109019", "아이엠뱅크"),
    "busan": ("00124106", "부산은행"),
    "gwangju": ("01028164", "광주은행"),
    "jeonbuk": ("00147295", "전북은행"),
    "gyeongnam": ("01030132", "경남은행"),
    "kakao": ("01133217", "카카오뱅크"),
}
HOLDING_CORPS: dict[str, str] = {
    "00688996": "KB금융", "00382199": "신한지주", "00547583": "하나금융지주", "01350869": "우리금융지주",
    "00908021": "농협금융지주", "00858364": "BNK금융지주", "00980122": "JB금융지주", "00878915": "iM금융지주",
}
FILING_CORPS: dict[str, str] = {**HOLDING_CORPS, **{code: name for code, name in BANK_CORPS.values()}}

# What the site shows, in order: DART account name -> short key.
ACCOUNTS: dict[str, str] = {
    "자산총계": "assets",
    "부채총계": "liabilities",
    "자본총계": "equity",
    "예수부채": "deposits",
    "이자수익": "interest_income",
    "이자비용": "interest_expense",
    "순이자손익": "net_interest",
    "영업이익(손실)": "operating_income",
    "당기순이익(손실)": "net_income",
}


class DartError(RuntimeError):
    pass


@dataclass(frozen=True)
class MainAccounts:
    corp_code: str
    year: int
    fs_div: str  # OFS 별도 / CFS 연결
    period_end: str  # e.g. "2025.12.31"
    receipt_no: str
    current: dict[str, Decimal]
    previous: dict[str, Decimal]


@dataclass(frozen=True)
class Filing:
    receipt_no: str
    corp_code: str
    corp_name: str
    title: str
    filed_on: date
    filer: str


def _get(path: str, params: dict[str, object]) -> dict[str, object]:
    try:
        with urlopen(f"{API_URL}/{path}?{urlencode(params)}", timeout=30) as response:
            body = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise DartError(f"DART 응답 오류(HTTP {error.code})") from error
    except (URLError, TimeoutError, ValueError) as error:
        raise DartError("DART에 연결하지 못했습니다.") from error
    if not isinstance(body, dict):
        raise DartError("DART 응답 형식이 올바르지 않습니다.")
    return body


def _amount(value: object) -> Decimal | None:
    text = str(value or "").replace(",", "").strip()
    if not text or text == "-":
        return None
    try:
        return Decimal(text)
    except InvalidOperation:
        return None


def parse_main_accounts(body: dict[str, object], corp_code: str, year: int) -> MainAccounts | None:
    status = str(body.get("status"))
    if status == NO_DATA:
        return None
    if status != "000":
        raise DartError(f"DART 오류 {status}: {body.get('message')}")
    rows = [row for row in body.get("list") or [] if isinstance(row, dict)]
    for fs_div in ("OFS", "CFS"):
        chosen = [row for row in rows if row.get("fs_div") == fs_div and row.get("account_nm") in ACCOUNTS]
        if not chosen:
            continue
        current = {ACCOUNTS[row["account_nm"]]: amount for row in chosen if (amount := _amount(row.get("thstrm_amount"))) is not None}
        previous = {ACCOUNTS[row["account_nm"]]: amount for row in chosen if (amount := _amount(row.get("frmtrm_amount"))) is not None}
        period = str(chosen[0].get("thstrm_dt", "")).replace(" 현재", "").strip()
        return MainAccounts(corp_code, year, fs_div, period, str(chosen[0].get("rcept_no", "")), current, previous)
    return None


def fetch_main_accounts(api_key: str, corp_code: str, latest_year: int) -> MainAccounts | None:
    """The newest business report's main accounts, trying this year's and then the year before."""
    for year in (latest_year, latest_year - 1):
        body = _get("fnlttSinglAcnt.json", {"crtfc_key": api_key, "corp_code": corp_code, "bsns_year": year, "reprt_code": BUSINESS_REPORT})
        found = parse_main_accounts(body, corp_code, year)
        if found is not None:
            return found
    return None


def parse_filings(body: dict[str, object]) -> list[Filing]:
    status = str(body.get("status"))
    if status == NO_DATA:
        return []
    if status != "000":
        raise DartError(f"DART 오류 {status}: {body.get('message')}")
    filings = []
    for row in body.get("list") or []:
        if not isinstance(row, dict) or not row.get("rcept_no"):
            continue
        day = str(row.get("rcept_dt", ""))
        try:
            filed_on = date(int(day[:4]), int(day[4:6]), int(day[6:8]))
        except ValueError:
            continue
        filings.append(Filing(
            str(row["rcept_no"]), str(row.get("corp_code", "")), str(row.get("corp_name", "")).strip(),
            " ".join(str(row.get("report_nm", "")).split()), filed_on, str(row.get("flr_nm", "")).strip(),
        ))
    return filings


def fetch_filings(api_key: str, corp_code: str, start: date, end: date) -> list[Filing]:
    body = _get("list.json", {
        "crtfc_key": api_key, "corp_code": corp_code, "bgn_de": start.strftime("%Y%m%d"), "end_de": end.strftime("%Y%m%d"),
        "page_count": 100,
    })
    return parse_filings(body)

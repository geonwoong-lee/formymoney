"""금융감독원 「금융상품 한눈에」 Open API client for 전세자금대출 (rent deposit loan) products.

Same key and channel as the deposit and savings rates (see finlife.py). A loan product has one row per
repayment type and rate type, each with the lowest and highest rate the lender discloses.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

from app.collectors.finlife import API_URL, GROUPS, MAX_PAGES, FinlifeError, _decimal, _text

SERVICE = "rentHouseLoanProductsSearch"


@dataclass(frozen=True)
class LoanRate:
    group: str
    company: str
    product_code: str
    product_name: str
    repay_type: str  # 만기일시상환방식 / 분할상환방식
    rate_type: str  # 고정금리 / 변동금리
    rate_min: Decimal | None
    rate_max: Decimal | None
    loan_limit: str
    early_repay_fee: str
    delay_rate: str
    join_way: str
    disclosed_month: str


def parse_loan_page(payload: dict[str, object], group: str) -> tuple[list[LoanRate], int]:
    result = payload.get("result")
    if not isinstance(result, dict):
        raise FinlifeError("금감원 응답 형식이 올바르지 않습니다.")
    if str(result.get("err_cd")) != "000":
        raise FinlifeError(f"금감원 오류 {result.get('err_cd')}: {result.get('err_msg')}")
    bases = {
        str(item.get("fin_prdt_cd")): item
        for item in result.get("baseList") or [] if isinstance(item, dict) and item.get("fin_prdt_cd")
    }
    rates: list[LoanRate] = []
    for option in result.get("optionList") or []:
        if not isinstance(option, dict):
            continue
        base = bases.get(str(option.get("fin_prdt_cd")))
        if base is None:
            continue
        low, high = _decimal(option.get("lend_rate_min")), _decimal(option.get("lend_rate_max"))
        if low is None and high is None:
            continue
        rates.append(LoanRate(
            group=GROUPS.get(group, group), company=str(base.get("kor_co_nm", "")).strip(),
            product_code=str(base.get("fin_prdt_cd")), product_name=str(base.get("fin_prdt_nm", "")).strip(),
            repay_type=str(option.get("rpay_type_nm") or "").strip(), rate_type=str(option.get("lend_rate_type_nm") or "").strip(),
            rate_min=low if low is not None else high, rate_max=high if high is not None else low,
            loan_limit=_text(base.get("loan_lmt")), early_repay_fee=_text(base.get("erly_rpay_fee")),
            delay_rate=_text(base.get("dly_rate")), join_way=_text(base.get("join_way")),
            disclosed_month=str(base.get("dcls_month", "")),
        ))
    try:
        max_page = int(str(result.get("max_page_no") or 1))
    except ValueError:
        max_page = 1
    return rates, max_page


def fetch_loans(api_key: str, group: str) -> list[LoanRate]:
    loans: list[LoanRate] = []
    page = 1
    while True:
        query = urlencode({"auth": api_key, "topFinGrpNo": group, "pageNo": page})
        try:
            with urlopen(f"{API_URL}/{SERVICE}.json?{query}", timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise FinlifeError(f"금감원 응답 오류(HTTP {error.code})") from error
        except (URLError, TimeoutError, ValueError) as error:
            raise FinlifeError("금감원 API에 연결하지 못했습니다.") from error
        rates, max_page = parse_loan_page(payload, group)
        loans += rates
        if page >= min(max_page, MAX_PAGES):
            return loans
        page += 1

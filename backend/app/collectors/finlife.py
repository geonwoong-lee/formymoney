"""금융감독원 「금융상품 한눈에」 Open API client for deposit and savings product rates.

The Open API is the channel FSS offers for reusing its comparison disclosure data, so the site uses it instead of
reading the comparison pages. Needs VERY_RICH_FINLIFE_API_KEY (a 32-character key from finlife.fss.or.kr).
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation
from typing import Literal
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import urlopen

API_URL = "https://finlife.fss.or.kr/finlifeapi"
SERVICES = {"deposit": "depositProductsSearch", "saving": "savingProductsSearch"}
GROUPS = {"020000": "은행", "030300": "저축은행"}
MAX_PAGES = 20

ProductKind = Literal["deposit", "saving"]


class FinlifeError(RuntimeError):
    pass


@dataclass(frozen=True)
class ProductRate:
    kind: ProductKind
    group: str
    company: str
    product_code: str
    product_name: str
    term_months: int
    rate_type: str  # 단리 / 복리
    reserve_type: str  # 적금만: 정액적립식 / 자유적립식, 예금은 ""
    base_rate: Decimal | None
    max_rate: Decimal | None
    disclosed_month: str


def _decimal(value: object) -> Decimal | None:
    if value in (None, ""):
        return None
    try:
        number = Decimal(str(value))
    except InvalidOperation:
        return None
    return number if number.is_finite() else None


def parse_page(payload: dict[str, object], kind: ProductKind, group: str) -> tuple[list[ProductRate], int]:
    """Products on one page and the last page number."""
    result = payload.get("result")
    if not isinstance(result, dict):
        raise FinlifeError("금감원 응답 형식이 올바르지 않습니다.")
    if str(result.get("err_cd")) != "000":
        raise FinlifeError(f"금감원 오류 {result.get('err_cd')}: {result.get('err_msg')}")
    bases = {
        str(item.get("fin_prdt_cd")): item
        for item in result.get("baseList") or [] if isinstance(item, dict) and item.get("fin_prdt_cd")
    }
    rates: list[ProductRate] = []
    for option in result.get("optionList") or []:
        if not isinstance(option, dict):
            continue
        base = bases.get(str(option.get("fin_prdt_cd")))
        try:
            term = int(str(option.get("save_trm", "")))
        except ValueError:
            continue
        if base is None or term <= 0:
            continue
        rates.append(ProductRate(
            kind=kind, group=GROUPS.get(group, group), company=str(base.get("kor_co_nm", "")).strip(),
            product_code=str(base.get("fin_prdt_cd")), product_name=str(base.get("fin_prdt_nm", "")).strip(),
            term_months=term, rate_type=str(option.get("intr_rate_type_nm") or "").strip(),
            reserve_type=str(option.get("rsrv_type_nm") or "").strip(),
            base_rate=_decimal(option.get("intr_rate")), max_rate=_decimal(option.get("intr_rate2")),
            disclosed_month=str(base.get("dcls_month", "")),
        ))
    try:
        max_page = int(str(result.get("max_page_no") or 1))
    except ValueError:
        max_page = 1
    return rates, max_page


def fetch_products(api_key: str, kind: ProductKind, group: str) -> list[ProductRate]:
    products: list[ProductRate] = []
    page = 1
    while True:
        query = urlencode({"auth": api_key, "topFinGrpNo": group, "pageNo": page})
        try:
            with urlopen(f"{API_URL}/{SERVICES[kind]}.json?{query}", timeout=20) as response:
                payload = json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raise FinlifeError(f"금감원 응답 오류(HTTP {error.code})") from error
        except (URLError, TimeoutError, ValueError) as error:
            raise FinlifeError("금감원 API에 연결하지 못했습니다.") from error
        rates, max_page = parse_page(payload, kind, group)
        products += rates
        if page >= min(max_page, MAX_PAGES):
            return products
        page += 1

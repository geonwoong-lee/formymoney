"""Lookups and calculations 머니독 can run on the site's own data before it answers.

Each tool is plain code, not the model: it reads a question (and the earlier ones, for follow-ups such as "그럼 서울은?"),
finds the values it needs with patterns, and returns text with the numbers the answer may use. The model only words
that text, and the answer checks (numbers must appear in the cited text) apply to it like any other source.
Nothing here recommends a product or a policy: lists are ordered by a stated rule, which is not a ranking of quality.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.calculators.maturity import deposit_lump_sum, monthly_savings_after_tax
from app.collectors.youth_policy import REGIONS
from app.schemas.loans import LoanProductsRequest
from app.schemas.youth_policies import YouthPoliciesRequest
from app.services.loan_service import loan_products
from app.services.youth_policy_service import youth_policies

MAX_MONTHS = 120
FOLLOW_UP_LENGTH = 20  # a short question after another one is read together with it


@dataclass(frozen=True)
class ToolResult:
    title: str
    content: str
    url: str | None = None


YOUTH_TRIGGER = re.compile(r"지원|수당|바우처|보조금|장학|청년\s*정책")
LOAN_TRIGGER = re.compile(r"전세\s*(자금)?\s*대출|전세자금")
SAVINGS_TRIGGER = re.compile(r"적금|예금")
CALC_WORDS = re.compile(r"이자|만기|얼마|받을|받아|모이|모여|계산|불어|늘어")

REGION_WORDS = {
    "서울": "11", "부산": "26", "대구": "27", "인천": "28", "광주": "12", "전남": "12", "전라남도": "12", "대전": "30", "울산": "31",
    "세종": "36", "경기": "41", "충북": "43", "충청북도": "43", "충남": "44", "충청남도": "44", "경북": "47", "경상북도": "47",
    "경남": "48", "경상남도": "48", "제주": "50", "강원": "51", "전북": "52", "전라북도": "52",
}
TOPIC_WORDS = (
    "월세", "전세", "주거", "임대", "취업", "구직", "면접", "자격증", "창업", "대출", "이자", "교통", "학자금", "장학", "교육", "문화",
    "운동", "건강", "상담", "해외", "농업", "귀농", "육아", "결혼", "복지", "인턴", "일자리", "자산", "저축",
)
UNITS = {"억": 10**8, "천만": 10**7, "백만": 10**6, "만": 10**4}
MONEY = re.compile(r"((?:\d+(?:\.\d+)?\s*(?:억|천만|백만|만)\s*)+)(?:원)?|(\d{1,3}(?:,\d{3})+|\d{5,})\s*원?")
MONEY_PART = re.compile(r"(\d+(?:\.\d+)?)\s*(억|천만|백만|만)")
MONTHS = re.compile(r"(\d+)\s*개월")
YEARS = re.compile(r"(\d+)\s*(?:년|해)")
RATE = re.compile(r"(\d+(?:\.\d+)?)\s*(?:%|퍼센트|프로)")
AGE = re.compile(r"(\d{2})\s*(?:세|살)")


def _amounts(text: str) -> list[int]:
    found: list[int] = []
    for match in MONEY.finditer(text):
        if match.group(1):
            value = sum(Decimal(number) * UNITS[unit] for number, unit in MONEY_PART.findall(match.group(1)))
            found.append(int(value))
        else:
            found.append(int(match.group(2).replace(",", "")))
    return found


def _months(text: str) -> int | None:
    months = MONTHS.findall(text)
    if months:
        return int(months[-1])
    years = YEARS.findall(text)
    return int(years[-1]) * 12 if years else None


def _rate(text: str) -> Decimal | None:
    rates = RATE.findall(text)
    try:
        value = Decimal(rates[-1]) if rates else None
    except InvalidOperation:
        return None
    return value if value is not None and Decimal("0") < value <= Decimal("30") else None


def _age(text: str) -> int | None:
    ages = [int(age) for age in AGE.findall(text) if 15 <= int(age) <= 45]
    return ages[-1] if ages else None


def _last_region(text: str) -> str:
    best, code = -1, ""
    for word, value in REGION_WORDS.items():
        index = text.rfind(word)
        if index > best:
            best, code = index, value
    return code


def _last_topic(text: str) -> str:
    best, topic = -1, ""
    for word in TOPIC_WORDS:
        index = text.rfind(word)
        if index > best:
            best, topic = index, word
    return topic


def _won(value: int) -> str:
    return f"{value:,}원"


def youth_policy_tool(session: Session, text: str) -> ToolResult:
    """Search the stored 온통청년 policies with the same filters as the 청년정책 찾기 screen."""
    region, topic, age = _last_region(text), _last_topic(text), _age(text)
    response = youth_policies(session, YouthPoliciesRequest(keyword=topic, region=region, age=age, open_only=True, limit=5))
    used = [f"검색어 {topic}" if topic else "", f"지역 {REGIONS[region]}" if region in REGIONS else "", f"만 {age}세" if age else ""]
    used_text = ", ".join(part for part in used if part) or "조건 없음"
    if response.total == 0:
        return ToolResult("청년정책 조회", "청년정책 자료가 아직 수집되지 않았어요.", "/youth-policies")
    lines = [f"온통청년 청년정책 {response.total:,}개 중 신청이 끝나지 않은 정책에서 ({used_text}) 조건으로 찾은 것은 {response.count:,}개예요."]
    if response.count:
        lines.append("신청 마감이 가까운 순서로 줄 세웠을 뿐이고 추천이 아니에요. 상위 정책:")
    for index, policy in enumerate(response.policies, 1):
        support = (policy.support.split("\n")[0])[:70]
        parts = [policy.institution, policy.apply_label, policy.age_label, policy.region_label]
        lines.append(f"{index}. {policy.name}: " + " / ".join(part for part in parts if part) + (f" / 지원 {support}" if support else ""))
    if not topic and not region and age is None:
        lines.append("분야(월세·취업·창업 등), 지역, 나이를 알려 주면 더 좁혀 볼 수 있어요.")
    lines.append("나이 외의 소득·거주 조건은 정책마다 달라서 판정하지 않았어요. 신청 전에 공고에서 확인해야 해요.")
    return ToolResult("청년정책 조회", "\n".join(lines), "/youth-policies")


def rent_loan_tool(session: Session, text: str) -> ToolResult:
    """Disclosed 전세자금대출 for the amount and term in the question (1억 원, 24개월 when not given)."""
    amounts = [amount for amount in _amounts(text) if 1_000_000 <= amount <= 3_000_000_000]
    principal = amounts[-1] if amounts else 100_000_000
    months = _months(text) or 24
    months = min(max(months, 6), MAX_MONTHS)
    response = loan_products(session, LoanProductsRequest(principal=principal, months=months, group="bank"))
    if response.count == 0:
        return ToolResult("전세자금대출 조회", "공시된 전세자금대출 자료가 아직 수집되지 않았어요.", "/rent-loans")
    low = min(product.rate_min for product in response.products)
    high = max(product.rate_max for product in response.products)
    given = "질문에 있는 금액과 기간" if amounts or _months(text) else "금액과 기간이 없어 1억원, 24개월로 가정한 값"
    lines = [
        f"금융감독원에 공시된 은행 전세자금대출 {response.count}개를 {_won(principal)}, {months}개월 기준으로 계산했어요({given}).",
        f"공시 금리는 가장 낮은 곳 연 {low}%부터 가장 높은 곳 연 {high}%까지예요. 내가 받는 금리는 신용·보증 조건을 보고 은행이 정해요.",
        "총이자가 적은 순서로 줄 세웠을 뿐 추천이 아니에요. 상위 상품:",
    ]
    for index, product in enumerate(response.products[:3], 1):
        lines.append(
            f"{index}. {product.company} {product.product_name}({product.rate_type}, {product.repay_type}): 금리 연 {product.rate_min}~{product.rate_max}%, "
            f"{product.monthly_label} {_won(product.monthly_min)}~{_won(product.monthly_max)}"
        )
    lines.append("보증료·인지세·중도상환수수료는 계산에 넣지 않았어요.")
    return ToolResult("전세자금대출 조회", "\n".join(lines), "/rent-loans")


def savings_calc_tool(text: str, earlier: list[str]) -> ToolResult | None:
    """Maturity of a monthly savings plan or a lump-sum deposit with the amount, months and yearly rate in the question."""
    everything = [text, *reversed(earlier)]  # the question first, then earlier ones for what it leaves out

    def pick(find):
        return next((value for chunk in everything if (value := find(chunk)) is not None), None)

    amount = pick(lambda chunk: (_amounts(chunk) or [None])[-1])
    months = pick(_months)
    rate = pick(_rate)
    if amount is None and months is None and rate is None:
        return None
    monthly = "적금" in text or ("예금" not in text and any("적금" in chunk for chunk in earlier))
    kind = "적금(매달 넣는 돈)" if monthly else "예금(한 번에 넣는 돈)"
    missing = [name for name, value in (("금액", amount), ("기간", months), ("연 이율(%)", rate)) if value is None]
    if missing:
        return ToolResult("이자 계산", f"{kind} 이자를 계산하려면 {', '.join(missing)}이 더 필요해요. 질문에 없어서 계산하지 못했어요.")
    assert amount is not None and months is not None and rate is not None
    months = min(max(months, 1), MAX_MONTHS)
    if monthly:
        result = monthly_savings_after_tax(amount, months, rate, compound=False)
        paid = amount * months
        head = f"매달 {_won(amount)}씩 {months}개월 동안 연 {rate}%(단리) 적금에 넣으면: 낸 돈 합계 {_won(paid)}"
    else:
        result = deposit_lump_sum(amount, months, rate)
        paid = amount
        head = f"{_won(amount)}을 연 {rate}%(단리) 예금에 {months}개월 맡기면: 맡긴 돈 {_won(paid)}"
    lines = [
        f"{head}, 이자 {_won(result.interest)}이에요. 이자소득세(15.4%) {_won(result.tax)}을 빼면 세후 이자는 {_won(result.interest - result.tax)}이에요.",
        f"세금을 빼기 전 만기에 받는 돈은 {_won(result.ending_value)}, 세금을 뺀 뒤는 {_won(result.ending_value_after_tax)}이에요.",
        "단리, 일반과세 기준이고 우대금리·비과세·복리는 넣지 않았어요. 실제 상품의 이율과 조건은 가입하는 곳에서 확인해야 해요.",
    ]
    return ToolResult("이자 계산", "\n".join(lines), "/maturity")


def run_tools(session: Session, message: str, history: list[str]) -> list[ToolResult]:
    """Results for what the question asks. `history` holds the visitor's earlier questions, oldest first."""
    earlier = [item for item in history if item.strip()][-3:]
    text = " ".join(message.split())
    results: list[ToolResult] = []

    def triggered(trigger: re.Pattern[str]) -> str | None:
        if trigger.search(text):
            return " ".join([*earlier, text]) if len(text) <= FOLLOW_UP_LENGTH else text
        # A short follow-up ("그럼 경기는?") carries on with the topic of the last question.
        if earlier and len(text) <= FOLLOW_UP_LENGTH and trigger.search(earlier[-1]):
            return " ".join([earlier[-1], text])
        return None

    if (combined := triggered(LOAN_TRIGGER)) is not None:
        results.append(rent_loan_tool(session, combined))
    elif (combined := triggered(YOUTH_TRIGGER)) is not None:
        results.append(youth_policy_tool(session, combined))
    savings_context = SAVINGS_TRIGGER.search(text) or (earlier and len(text) <= FOLLOW_UP_LENGTH and SAVINGS_TRIGGER.search(earlier[-1]))
    if savings_context and (CALC_WORDS.search(text) or _amounts(text) or _rate(text) or _months(text)):
        calculated = savings_calc_tool(text, earlier)
        if calculated is not None:
            results.append(calculated)
    return results

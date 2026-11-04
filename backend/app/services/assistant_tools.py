"""Lookups and calculations 머니독 can run on the site's own data before it answers.

Each tool is plain code, not the model: it reads a question (and the earlier ones, for follow-ups such as "그럼 서울은?"),
finds the values it needs with patterns, and returns text with the numbers the answer may use. The model only words
that text, and the answer checks (numbers must appear in the cited text) apply to it like any other source.
Nothing here recommends a product or a policy: lists are ordered by a stated rule, which is not a ranking of quality.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from datetime import date, datetime
from zoneinfo import ZoneInfo
from decimal import Decimal, InvalidOperation

from sqlalchemy.orm import Session

from app.calculators.maturity import deposit_lump_sum, monthly_savings_after_tax
from app.collectors.youth_policy import REGIONS
from app.schemas.assistant_profile import AssistantProfile
from app.schemas.loans import LoanProductsRequest
from app.schemas.maturity import DepositProductsRequest, SavingProductsRequest
from app.schemas.savings import Answer, CalculationRequest, CashflowCalculationRequest, ContributionType
from app.schemas.youth_policies import YouthPoliciesRequest
from app.services.loan_service import loan_products
from app.services.market_service import MarketService
from app.services.maturity_service import deposit_products, saving_products
from app.services.savings_service import SavingsDataError, SavingsInputError, SavingsService
from app.services.youth_policy_service import youth_policies

MAX_MONTHS = 120
FOLLOW_UP_LENGTH = 20  # a short question after another one is read together with it


@dataclass(frozen=True)
class ToolResult:
    title: str
    content: str
    url: str | None = None


# "혜택·제도·도와주는" alone are too common ("예금자보호제도"), so they count only next to a youth word or a life topic.
YOUTH_CONTEXT = "청년|취준|취업|구직|창업|대학생|학자금|신혼|사회초년|월세|주거|집 구|자격증|면접|교통비|육아|결혼"
YOUTH_TRIGGER = re.compile(
    r"지원|수당|바우처|보조금|장학|청년\s*정책|^(?=.*(?:혜택|제도|도와주|도움|받을 수 있는))(?=.*(?:" + YOUTH_CONTEXT + r")).*$"
)
LOAN_TRIGGER = re.compile(r"전세\s*(자금)?\s*대출|전세자금|전월세\s*(자금\s*)?대출|보증금\s*대출|전세.{0,10}(빌리|빌려|이자|이율|금리)|전세\s*\d")
TOPIC_ALIASES = {"취준": "취업", "집 구": "주거", "신혼": "결혼", "대학생": "교육", "사회초년": "일자리"}
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


SPOKEN_CHEON = re.compile(r"(억)\s*(\d+)\s*천(?!\s*만)")


def _spoken_to_written(match: re.Match[str]) -> str:
    return f"{match.group(1)} {match.group(2)}천만"


def _amounts(text: str) -> list[int]:
    text = SPOKEN_CHEON.sub(_spoken_to_written, text)  # "1억5천" is spoken for 1억 5천만
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
    if not topic:  # everyday words people use instead of the policy's own term
        for word, mapped in TOPIC_ALIASES.items():
            if word in text:
                return mapped
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
    if DETAIL_WORDS.search(text) and response.policies:
        # The policy the question names comes first: more of the question's own words in its name, then the list's order.
        pool = youth_policies(session, YouthPoliciesRequest(keyword=topic, region=region, age=age, open_only=True, limit=50)).policies if topic else response.policies
        words = [word for word in re.findall(r"[가-힣A-Za-z0-9]{2,}", text) if word not in DETAIL_STOP]
        chosen = sorted(pool, key=lambda item: -sum(word in item.name for word in words))[:2]
        lines.append("신청 방법·자격을 물으셔서 질문과 가장 잘 맞는 정책 두 개를 자세히 적어요(공고 글을 줄여 옮겼어요):")
        for policy in chosen:
            fields = [
                ("신청 방법", policy.apply_method), ("선정 방법", policy.selection), ("소득 조건", policy.income_note),
                ("추가 자격", policy.extra_conditions), ("신청 링크", policy.apply_url),
            ]
            shown = [f"{label} {' '.join(value.split())[:140]}" for label, value in fields if value.strip()]
            lines.append(f"- {policy.name}: " + (" / ".join(shown) if shown else "공고에 신청 방법이 따로 적혀 있지 않아요"))
    if not topic and not region and age is None:
        lines.append("분야(월세·취업·창업 등), 지역, 나이를 알려 주면 더 좁혀 볼 수 있어요.")
    lines.append("나이 외의 소득·거주 조건은 정책마다 달라서 판정하지 않았어요. 신청 전에 공고에서 확인해야 해요.")
    return ToolResult("청년정책 조회", "\n".join(lines), "/youth-policies")


DETAIL_WORDS = re.compile(r"신청\s*방법|어떻게\s*신청|어디서\s*신청|자격|대상|조건|서류|언제까지|링크|선정|심사")
# Words that say what is being asked, not which policy.
DETAIL_STOP = {"신청", "방법", "알려줘", "알려", "자격", "어떻게", "정책", "청년", "청년정책", "중에", "있어", "있나요", "어디서", "대상", "조건", "언제까지", "서류", "링크", "선정", "심사", "지원", "알려주세요", "궁금해"}


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


MARKET_WORDS: list[tuple[tuple[str, ...], tuple[str, ...]]] = [
    (("기준금리", "한국은행 금리"), ("base_rate",)),
    (("국고채",), ("ktb_3y",)),
    (("예금 평균", "예금금리 평균", "예금 금리 평균", "평균 예금"), ("deposit_rate",)),
    (("코스피",), ("kospi",)),
    (("코스닥",), ("kosdaq",)),
    (("나스닥",), ("us_nasdaq",)),
    (("s&p", "에스앤피"), ("us_sp500",)),
    (("다우",), ("us_dow",)),
    (("미국 증시", "뉴욕증시", "미국 주식", "미국 주가"), ("us_nasdaq", "us_sp500", "us_dow")),
    (("환율", "원달러", "원/달러", "달러", "엔화", "유로", "위안"), ("usd_krw", "eur_krw", "jpy_krw", "cny_krw")),
    (("물가상승률", "소비자물가", "인플레", "물가 얼마"), ("cpi_yoy",)),
]
FX_WORDS = {"usd_krw": ("달러", "원달러", "원/달러"), "eur_krw": ("유로",), "jpy_krw": ("엔",), "cny_krw": ("위안",)}


def _number(value: Decimal) -> str:
    text = f"{value:,.2f}"
    return text.rstrip("0").rstrip(".") if "." in text else text


def _day_label(period: str) -> str:
    if len(period) == 8:
        return f"{period[:4]}년 {int(period[4:6])}월 {int(period[6:])}일"
    return f"{period[:4]}년 {int(period[4:6])}월"


def market_tool(session: Session, text: str) -> ToolResult | None:
    """The latest collected value of the market figure the question names, so it never depends on the search finding it."""
    lowered = text.lower()
    wanted: list[str] = []
    for words, codes in MARKET_WORDS:
        if any(word in lowered for word in words):
            if codes[0] == "usd_krw":  # a named currency narrows 환율 to that currency
                named = [code for code in codes if any(word in text for word in FX_WORDS[code])]
                codes = tuple(named) if named else codes
            wanted += [code for code in codes if code not in wanted]
    if not wanted:
        return None
    snapshot = MarketService(session).snapshot()
    items = {item.code: item for group in snapshot.groups for item in group.items}
    lines: list[str] = []
    for code in wanted:
        item = items.get(code)
        if item is None:
            continue
        unit = "" if "=" in item.unit else item.unit
        line = f"{item.name}: {_day_label(item.period)} 기준 {_number(item.value)}{unit}"
        if item.change is not None and item.previous_period:
            move = "%p" if item.unit == "%" else unit
            if item.change:
                direction = "올랐어요" if item.change > 0 else "내렸어요"
                line += f", 바로 전 값({_day_label(item.previous_period)})보다 {_number(abs(item.change))}{move} {direction}"
            else:
                line += ", 바로 전 값과 같아요"
        lines.append(line)
    if not lines:
        return ToolResult("시장 지표 조회", "물어본 지표는 아직 수집되지 않았어요.", "/market")
    lines.append("전 거래일(또는 전 영업일) 기준 값이라 실시간 시세가 아니에요.")
    return ToolResult("시장 지표 조회", "\n".join(lines), "/market")


PRODUCT_RATE_TRIGGER = re.compile(
    r"(정기예금|예금|적금).{0,18}(금리|이율|이자율)|(금리|이율|이자율).{0,18}(정기예금|예금|적금)"
    r"|(예금|적금).{0,10}이자.{0,12}(많|높|비교|어디|좋)|이자.{0,8}(많이|높은).{0,10}(예금|적금)"
)
BANK_WORD = re.compile(r"([가-힣A-Za-z]{1,8})은행")
GENERIC_BANKS = {"시중", "저축", "인터넷", "지방", "특수", "국책"}
# People say "신한 적금" without 은행. The value is the text the disclosure uses for the company.
BANK_ALIASES = {
    "신한": "신한", "국민": "국민", "kb": "국민", "우리": "우리", "하나": "하나", "농협": "농협", "nh": "농협", "카카오": "카카오", "토스": "토스",
    "케이뱅크": "케이뱅크", "수협": "수협", "부산": "부산", "광주": "광주", "전북": "전북", "제주": "제주", "대구": "대구", "경남": "경남",
    "산업": "산업", "ibk": "중소기업", "기업은행": "중소기업", "sc제일": "제일", "아이엠": "아이엠", "im뱅크": "아이엠",
}


def _banks_named(text: str) -> list[str]:
    lowered = text.lower()
    named = [word for word in BANK_WORD.findall(text) if word not in GENERIC_BANKS]
    named += [value for alias, value in BANK_ALIASES.items() if alias in lowered]
    return list(dict.fromkeys(named))


def product_rate_tool(session: Session, text: str) -> ToolResult | None:
    """Disclosed deposit or savings rates, for the bank named in the question or the first few in the site's order."""
    if _rate(text) is not None:  # "연 4% 적금이면?" is a calculation, handled elsewhere
        return None
    saving = "적금" in text
    group = "savings_bank" if "저축은행" in text else "bank"
    months = _months(text)
    amounts = [amount for amount in _amounts(text) if amount >= 10_000]
    assumptions: list[str] = []
    if saving:
        options = (6, 12, 24, 36)
        chosen = min(options, key=lambda option: abs(option - months)) if months else 12
        monthly = min(max(amounts[-1], 10_000), 5_000_000) if amounts else 300_000
        response = saving_products(session, SavingProductsRequest(monthly_amount=monthly, months=chosen, group=group, reserve="all"))
        kind = f"적금(매달 {_won(monthly)}, {chosen}개월)"
        if not amounts:
            assumptions.append("매달 넣는 돈은 30만원으로 가정")
    else:
        chosen = 24 if months and months > 18 else 12
        amount = min(max(amounts[-1], 100_000), 1_000_000_000) if amounts else 10_000_000
        response = deposit_products(session, DepositProductsRequest(amount=amount, months=chosen, group=group))
        kind = f"정기예금({_won(amount)}, {chosen}개월)"
        if not amounts:
            assumptions.append("맡기는 돈은 1,000만원으로 가정")
    if months and months != chosen:
        assumptions.append(f"{months}개월은 공시 자료가 없어 가까운 {chosen}개월로 조회")
    if response.count == 0:
        return ToolResult("예적금 금리 조회", "공시된 예·적금 금리가 아직 수집되지 않았어요.", "/general-savings")
    banks = _banks_named(text)
    picked = [item for item in response.products if any(bank in item.company for bank in banks)] if banks else []
    if banks and not picked:
        names = ", ".join(banks)
        return ToolResult("예적금 금리 조회", f"{kind} 공시에서 {names}의 상품을 찾지 못했어요. 금융감독원 공시에 없거나 이름이 달라서일 수 있어요.", "/general-savings")
    shown = picked[:4] if picked else response.products[:3]
    group_name = "저축은행" if group == "savings_bank" else "은행"
    who = "질문에 나온 은행의 상품" if picked else "세후 만기금액이 큰 순서로 줄 세운 상위 3개(추천이 아니라 순서일 뿐)"
    lines = [f"금융감독원에 공시된 {group_name} {kind} 상품 {response.count}개 중 {who}:"]
    for index, item in enumerate(shown, 1):
        top = f", 우대 포함 최고 연 {item.max_rate}%" if item.max_rate is not None and item.max_rate != item.base_rate else ""
        lines.append(f"{index}. {item.company} {item.product_name}: 기본 연 {item.base_rate}%{top}, 세후 만기 {_won(item.base_after_tax)}(공시 {item.disclosed_month[:4]}.{item.disclosed_month[4:6]})")
    if assumptions:
        lines.append("가정: " + ", ".join(assumptions) + ".")
    lines.append("우대금리 조건을 못 채우면 최고 금리를 못 받아요. 가입 조건과 한도는 상품마다 달라서 화면에서 확인해야 해요.")
    return ToolResult("예적금 금리 조회", "\n".join(lines), "/general-savings")


# "은행별 기본금리" with no product named is the site's own comparison, 청년미래적금 at the 14 banks.
YOUTH_SAVINGS_TRIGGER = re.compile(r"청년\s*(미래\s*)?적금|은행별\s*(기본\s*)?(금리|이율)|은행\s*(별로|마다)\s*(기본\s*)?(금리|이율)")
YOUTH_SAVINGS_ASK = re.compile(r"금리|이자|이율|한도|납입|기간|기여금|정부|지원금|얼마|몇|조건|비과세|은행|가입")


def youth_savings_tool(session: Session, text: str) -> ToolResult | None:
    """청년미래적금's terms and each bank's base and highest rate, from the site's own official-product data."""
    if not (YOUTH_SAVINGS_TRIGGER.search(text) and YOUTH_SAVINGS_ASK.search(text)):
        return None
    try:
        data = SavingsService(session).get_products()
    except SavingsDataError:
        return None
    policy, products = data.policy, data.products
    bases = [product.base_rate for product in products]
    highest = max(product.maximum_rate for product in products)
    lines = [
        f"{policy.name}: 가입 기간 {policy.term_months}개월, 한 달 납입 {_won(policy.minimum_monthly_amount)}~{_won(policy.maximum_monthly_amount)}, 연 납입 한도 {_won(policy.annual_limit)}.",
        f"정부기여금은 일반형 {policy.general_contribution_rate:g}%, 우대형 {policy.preferred_contribution_rate:g}%이고 이자는 {'비과세' if policy.tax_exempt else '과세'}예요(확인일 {policy.source_date}).",
        f"은행 {len(products)}곳의 기본금리는 연 {min(bases):g}%~{max(bases):g}%이고, 우대조건을 모두 채운 최고금리는 은행마다 달라 가장 높은 곳이 연 {highest:g}%예요.",
    ]
    for product in products[:4]:
        lines.append(f"- {product.bank_name} {product.product_name}: 기본 연 {product.base_rate:g}%, 최고 연 {product.maximum_rate:g}%")
    lines.append("내가 실제로 받는 금리는 우대조건을 얼마나 채우느냐에 따라 달라요. 은행 비교 화면에서 내 조건으로 계산할 수 있어요.")
    return ToolResult("청년미래적금 조회", "\n".join(lines), "/banks")


# A question about the visitor's own result: it names them (내 적금, 내가...), asks for a figure or a date, and is not a how-to.
PERSONAL_MARKER = re.compile(r"내\s*(적금|조건|납입|만기|계획|월|돈|금리|예상|정보|은행)|내가|나의|제\s*(적금|납입|조건|계획)|나는|저는|나한테|저한테|지금까지")
PERSONAL_RESULT = re.compile(r"얼마|언제|몇|계산|만기|예상|남았|받을|받게|모였|모이|금리|이자|며칠")
PERSONAL_HOWTO = re.compile(r"어디(에|서)|입력해|입력하|알림|방법|어떻게\s*(받|입력|확인|보)")


def is_about_me(text: str) -> bool:
    return bool(PERSONAL_MARKER.search(text) and PERSONAL_RESULT.search(text) and not PERSONAL_HOWTO.search(text))
CONTRIBUTION_LABELS = {"general": "일반형", "preferred": "우대형"}


def _add_months(start: str, months: int) -> tuple[int, int]:
    year, month = int(start[:4]), int(start[5:7])
    index = year * 12 + month - 1 + months
    return index // 12, index % 12 + 1


def my_plan_tool(session: Session, profile: AssistantProfile | None, today: date) -> ToolResult:
    """The visitor's own 청년미래적금 plan worked out with the site's calculators, from what they typed on this device."""
    empty = ToolResult("내 정보 조회", "저장된 내 정보가 없어요. 내 조건 화면에서 거래 은행과 월 납입액을 입력하면 내 숫자로 계산해 드려요.", "/conditions")
    if profile is None or not profile.bank_code or not profile.monthly_amount:
        return empty
    contribution = ContributionType(profile.contribution_type or "none")
    try:
        service = SavingsService(session)
        data = service.get_products()
        product = next((item for item in data.products if item.bank_code == profile.bank_code), None)
        if product is None:
            return empty
        policy = data.policy
        monthly = min(max(profile.monthly_amount, policy.minimum_monthly_amount), policy.maximum_monthly_amount)
        answers: dict[str, Answer] = {}
        for condition in product.conditions:
            raw = profile.conditions.get(f"{product.bank_code}:{condition.code}") or profile.conditions.get(f"common:{condition.code}") or "unknown"
            answers[condition.code] = Answer(raw)
        fixed = service.calculate(CalculationRequest(
            monthly_amount=monthly, contribution_type=contribution, condition_answers={product.bank_code: answers}, bank_codes=[product.bank_code],
        )).results[0]
        amounts = [profile.payments.get(str(index + 1), monthly) for index in range(policy.term_months)]
        valid = all(amount == 0 or policy.minimum_monthly_amount <= amount <= policy.maximum_monthly_amount for amount in amounts)
        recorded = None
        if valid and any(amount != monthly for amount in amounts):
            recorded = service.calculate_cashflow(CashflowCalculationRequest(
                bank_code=product.bank_code, monthly_amounts=amounts, fixed_monthly_amount=monthly, contribution_type=contribution, condition_answers=answers,
            ))
    except (SavingsDataError, SavingsInputError, ValueError):
        return empty

    kind = CONTRIBUTION_LABELS.get(profile.contribution_type or "", "정부기여금 없음")
    state = "가입 중" if profile.enrollment_status == "enrolled" else "가입을 고민 중" if profile.enrollment_status == "considering" else "가입 상태 미입력"
    lines = [
        f"이 기기에 입력해 둔 내 정보예요(이번 질문에만 쓰고 서버에 저장하지 않아요): {product.bank_name} {product.product_name}, {kind}, 매달 {_won(monthly)}, {state}.",
        f"내 우대조건 답으로 계산한 예상 금리는 연 {fixed.expected_rate:g}%(기본 {fixed.base_rate:g}% + 우대 {fixed.applied_bonus_rate:g}%p, 이 은행 최고 {fixed.maximum_rate:g}%)예요.",
        f"계획대로 {policy.term_months}개월 모두 넣으면 낸 돈 {_won(fixed.principal)}, 이자 {_won(fixed.deposit_interest)}, 정부기여금과 그 이자 {_won(fixed.government_contribution + fixed.government_contribution_interest)}이고 예상 만기금액은 {_won(fixed.expected_maturity_amount)}이에요.",
    ]
    if profile.start_month:
        end_year, end_month = _add_months(profile.start_month, policy.term_months)
        elapsed = (today.year * 12 + today.month) - (int(profile.start_month[:4]) * 12 + int(profile.start_month[5:7]))
        left = max(0, policy.term_months - max(0, elapsed))
        lines.append(f"가입 {profile.start_month[:4]}년 {int(profile.start_month[5:7])}월, 만기 {end_year}년 {end_month}월이고 지금은 {max(0, elapsed)}개월이 지나 {left}개월이 남았어요.")
    if recorded is not None:
        skipped = sum(1 for amount in amounts if amount == 0)
        reduced = sum(1 for amount in amounts if 0 < amount < monthly)
        change = recorded.difference_from_fixed_plan
        direction = "적어요" if change < 0 else "많아요"
        lines.append(
            f"월별 납입 계획에 적은 금액을 반영하면 낸 돈 {_won(recorded.result.principal)}, 예상 만기금액 {_won(recorded.result.expected_maturity_amount)}이에요. "
            f"계획대로일 때보다 {_won(abs(change))} {direction}(빠뜨린 달 {skipped}개월, 줄인 달 {reduced}개월)."
        )
    yes, no = list(answers.values()).count(Answer.yes), list(answers.values()).count(Answer.no)
    lines.append(f"우대조건은 충족 {yes}개, 미충족 {no}개, 모름 {len(answers) - yes - no}개로 계산했어요. 모름은 금리에 더하지 않아요.")
    return ToolResult("내 정보 계산", "\n".join(lines), "/conditions")


def run_tools(session: Session, message: str, history: list[str], profile: AssistantProfile | None = None, today: date | None = None) -> list[ToolResult]:
    """Results for what the question asks. `history` holds the visitor's earlier questions, oldest first."""
    earlier = [item for item in history if item.strip()][-3:]
    text = " ".join(message.split())
    results: list[ToolResult] = []
    if is_about_me(text):
        results.append(my_plan_tool(session, profile, today or datetime.now(ZoneInfo("Asia/Seoul")).date()))

    def triggered(trigger: re.Pattern[str]) -> str | None:
        if trigger.search(text):
            return " ".join([*earlier, text]) if len(text) <= FOLLOW_UP_LENGTH else text
        # A short follow-up ("그럼 경기는?") carries on with the topic of the last question.
        if earlier and len(text) <= FOLLOW_UP_LENGTH and trigger.search(earlier[-1]):
            return " ".join([earlier[-1], text])
        return None

    if (combined := triggered(LOAN_TRIGGER)) is not None:
        results.append(rent_loan_tool(session, combined))
    elif (found := youth_savings_tool(session, text)) is not None:
        results.append(found)
    elif (combined := triggered(YOUTH_TRIGGER)) is not None:
        results.append(youth_policy_tool(session, combined))
    if (found := market_tool(session, text)) is not None:
        results.append(found)
    # A question about a product's disclosed rate is a lookup, not a calculation, unless the visitor gives a rate to calculate with.
    looks_up_rates = False
    if not any(result.title == "청년미래적금 조회" for result in results) and (combined := triggered(PRODUCT_RATE_TRIGGER)) is not None:
        found = product_rate_tool(session, combined)
        if found is not None:
            results.append(found)
            looks_up_rates = True
    savings_context = SAVINGS_TRIGGER.search(text) or (earlier and len(text) <= FOLLOW_UP_LENGTH and SAVINGS_TRIGGER.search(earlier[-1]))
    if savings_context and not looks_up_rates and (CALC_WORDS.search(text) or _rate(text)):
        calculated = savings_calc_tool(text, earlier)
        if calculated is not None:
            results.append(calculated)
    return results

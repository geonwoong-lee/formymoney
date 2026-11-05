"""해지 전 계산: 지금 일반 중도해지할 때 받는 돈의 참고값과, 해지하지 않는 방법들의 만기 수령액을 비교한다.

은행별 중도해지 이율은 14개 은행 약관을 모두 확인하지 못해 쓰지 않는다. 이율을 지어내지 않고 기본금리를 그대로 적용한 참고값만 계산한다.
확인한 은행(카카오뱅크)은 중도해지 이율이 기본금리보다 낮으므로 그 은행에서는 실제로 받는 돈이 이보다 적다. 다른 은행은 상한이라고 단정하지 않는다.
"""
from decimal import ROUND_DOWN, Decimal

from app.calculators.maturity import INTEREST_TAX
from app.calculators.savings import MONTHS_IN_YEAR, PERCENT, _won
from app.schemas.savings import (
    CashflowCalculationRequest,
    EarlyExitRequest,
    EarlyExitResponse,
    EarlyExitScenario,
    EarlyExitTermination,
)
from app.services.savings_service import SavingsDataError, SavingsInputError, SavingsService


# 특별중도해지 사유. 카카오뱅크 청년미래적금 상품 안내에 적힌 목록이며, 화면에 이 출처를 따로 보인다.
SPECIAL_TERMINATION_SOURCE = "카카오뱅크 청년미래적금 상품 안내"
SPECIAL_TERMINATION_SOURCE_URL = "https://www.kakaobank.com/products/youthFutureSavings"
SPECIAL_TERMINATION_SOURCE_DATE = "2026-11-05"
SPECIAL_TERMINATION_REASONS = [
    "가입자의 사망 또는 해외 이주",
    "해지 전 6개월 안에 생긴 천재지변",
    "해지 전 6개월 안에 생긴 퇴직 또는 사업장 폐업",
    "해지 전 6개월 안에 생긴 3개월 이상 입원 치료·요양이 필요한 상해·질병",
    "해지 전 6개월 안에 생긴 저축 금융회사의 영업정지·인가취소·해산·파산",
]

UNAVAILABLE_NOTES = [
    "은행별 중도해지 이율은 계산하지 않았습니다. 해지할 때 받는 돈은 기본금리를 그대로 적용한 참고값입니다. 예를 들어 카카오뱅크는 입금 건별 예치 기간에 따라 기본금리보다 낮은 중도해지 금리를 적용한다고 안내하므로 실제로 받는 돈은 이보다 적습니다. 가입 은행의 상품설명서에서 중도해지 금리를 확인해야 합니다.",
    "남은 달을 쉬거나 최소 금액만 넣을 때 '몇 회 이상 납입' 같은 우대조건을 채우지 못할 수 있고, 오래 납입하지 않은 계좌의 처리는 은행 약관에 따라 다릅니다. 이 계산은 내 조건에 적은 답을 그대로 썼습니다.",
    "적금을 담보로 한 대출이 되는지는 은행마다 다릅니다(예: 카카오뱅크는 이 적금으로 예금담보대출을 받을 수 없다고 안내). 가입 은행에 확인해야 합니다.",
    "지금 받는 돈과 만기에 받는 돈은 받는 시점이 다릅니다.",
]


def calculate_early_exit(service: SavingsService, request: EarlyExitRequest) -> EarlyExitResponse:
    policy = service.repository.get_policy()
    if policy is None:
        raise SavingsDataError("공식 상품 정책을 불러오지 못했습니다.")
    term = policy.term_months
    if not 1 <= request.paid_months < term:
        raise SavingsInputError(f"낸 회차는 1회부터 {term - 1}회 사이여야 합니다.")

    def cashflow(amounts: list[int]):
        return service.calculate_cashflow(CashflowCalculationRequest(
            bank_code=request.bank_code,
            monthly_amounts=amounts,
            fixed_monthly_amount=request.fixed_monthly_amount,
            contribution_type=request.contribution_type,
            condition_answers=request.condition_answers,
        ))

    # 원래 계획을 먼저 계산해 입력(36개월분, 금액 범위, 은행·조건 코드)을 기존 규칙으로 검증한다.
    keep = cashflow(request.monthly_amounts)
    paid = request.monthly_amounts[:request.paid_months]
    months_left = term - request.paid_months
    pause = cashflow(paid + [0] * months_left)
    minimum = cashflow(paid + [policy.minimum_monthly_amount] * months_left)

    base_rate = Decimal(str(keep.result.base_rate))
    contribution_rate = service._contribution_rate(request.contribution_type, policy)
    # 월별 계산과 같은 기준: 각 회차의 돈은 그 달 초에 들어가 해지하는 달 말까지 예치된다.
    interest = sum(
        (Decimal(amount) * base_rate / PERCENT / MONTHS_IN_YEAR * Decimal(request.paid_months - index)
         for index, amount in enumerate(paid)),
        Decimal("0"),
    )
    base_interest = _won(interest)
    # 기존 세후 계산(app.calculators.maturity)과 같이 원 단위 아래는 버린다.
    tax = int((Decimal(base_interest) * INTEREST_TAX).quantize(Decimal("1"), rounding=ROUND_DOWN))
    principal = sum(paid)
    received = principal + base_interest - tax
    termination = EarlyExitTermination(
        principal=principal,
        interest_at_base_rate=base_interest,
        interest_tax=tax,
        received_at_base_rate=received,
        lost_government_contribution=_won(sum(
            (Decimal(amount) * contribution_rate / PERCENT for amount in paid), Decimal("0"))),
    )

    def scenario(key, label, future_amount, response) -> EarlyExitScenario:
        result = response.result
        return EarlyExitScenario(
            key=key,
            label=label,
            future_monthly_amount=future_amount,
            principal=result.principal,
            deposit_interest=result.deposit_interest,
            government_contribution=result.government_contribution,
            government_contribution_interest=result.government_contribution_interest,
            expected_maturity_amount=result.expected_maturity_amount,
            extra_principal=result.principal - principal,
            more_than_termination=result.expected_maturity_amount - received,
        )

    return EarlyExitResponse(
        bank_code=request.bank_code,
        bank_name=keep.result.bank_name,
        paid_months=request.paid_months,
        term_months=term,
        months_left=months_left,
        base_rate=keep.result.base_rate,
        expected_rate=keep.result.expected_rate,
        interest_tax_rate=float(INTEREST_TAX * PERCENT),
        termination=termination,
        scenarios=[
            scenario("keep", "원래 계획대로 넣기", None, keep),
            scenario("pause", "남은 달 쉬고 만기까지 두기", 0, pause),
            scenario("minimum", "남은 달 최소 금액만 넣기", policy.minimum_monthly_amount, minimum),
        ],
        special_termination_reasons=SPECIAL_TERMINATION_REASONS,
        special_termination_source=SPECIAL_TERMINATION_SOURCE,
        special_termination_source_url=SPECIAL_TERMINATION_SOURCE_URL,
        special_termination_source_date=SPECIAL_TERMINATION_SOURCE_DATE,
        unavailable_notes=UNAVAILABLE_NOTES,
        source_url=keep.result.source_url,
        source_date=keep.result.source_date,
    )

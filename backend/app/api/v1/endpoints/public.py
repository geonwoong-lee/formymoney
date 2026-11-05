"""다른 사이트가 쓰는 공개 계산 API. 로그인·쿠키 없이 GET으로 부르고, 어느 출처에서든 읽을 수 있다.

개인 입력은 월 납입액과 기여금 유형뿐이며 저장하지 않는다. 우대조건은 사람마다 다르므로 기본금리만 받은 경우와
공시된 우대조건을 모두 채운 경우의 범위로만 알려 주고, 은행 순위를 매기지 않는다(은행 코드 순).
"""
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, Response, status
from sqlalchemy.exc import SQLAlchemyError

from app.calculators.savings import calculate_fixed_monthly_savings
from app.repositories.savings_repository import SavingsRepository
from app.services.savings_service import SavingsService

router = APIRouter(prefix="/public")

DISCLAIMER = (
    "공시 금리로 계산한 세전 예상치입니다(청년미래적금 이자는 비과세). 실제 금리는 우대조건 충족 여부와 은행 심사에 따라 달라지며, "
    "특정 은행·상품을 추천하지 않습니다."
)


@router.get("/savings-estimate")
def savings_estimate(
    request: Request,
    response: Response,
    monthly_amount: int = Query(alias="monthlyAmount", ge=1_000, le=500_000),
    contribution_type: Literal["general", "preferred", "none"] = Query(default="general", alias="contributionType"),
) -> dict[str, object]:
    """월 납입액과 기여금 유형으로 은행별 청년미래적금 예상 만기액 범위(기본금리만 ~ 우대조건 모두)를 돌려준다."""
    # 다른 사이트의 화면에서 바로 읽을 수 있게 연다. 쿠키·인증을 쓰지 않는 GET이라 미리 묻는 요청(preflight)이 없다.
    response.headers["Access-Control-Allow-Origin"] = "*"
    key = request.client.host if request.client else "unknown"
    if not request.app.state.public_limiter.allow(key):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="잠시 후 다시 불러 주세요.",
                            headers={"Access-Control-Allow-Origin": "*"})
    if monthly_amount % 1_000 != 0:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="월 납입액은 1,000원 단위로 입력해야 합니다.",
                            headers={"Access-Control-Allow-Origin": "*"})
    try:
        with request.app.state.session_factory() as session:
            repository = SavingsRepository(session)
            policy = repository.get_policy()
            products = repository.list_products()
            if policy is None or not products:
                raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="상품 기준을 불러오지 못했습니다.",
                                    headers={"Access-Control-Allow-Origin": "*"})
            contribution_rate = SavingsService._contribution_rate(contribution_type, policy)
            banks = []
            for product in sorted(products, key=lambda item: item.bank_code):
                maximum_rate = product.base_rate + product.maximum_bonus_rate
                low = calculate_fixed_monthly_savings(monthly_amount, policy.term_months, product.base_rate, product.base_rate, contribution_rate)
                high = calculate_fixed_monthly_savings(monthly_amount, policy.term_months, maximum_rate, product.base_rate, contribution_rate)
                banks.append({
                    "bankCode": product.bank_code,
                    "bankName": product.bank_name,
                    "productName": product.product_name,
                    "baseRate": float(product.base_rate),
                    "maximumRate": float(maximum_rate),
                    "maturityAtBaseRate": low.expected_maturity_amount,
                    "maturityAtMaximumRate": high.expected_maturity_amount,
                    "sourceUrl": product.source_url,
                    "sourceDate": product.source_date,
                })
            return {
                "monthlyAmount": monthly_amount,
                "termMonths": policy.term_months,
                "contributionType": contribution_type,
                "contributionRate": float(contribution_rate),
                "principal": monthly_amount * policy.term_months,
                "banks": banks,
                "policySourceUrl": policy.source_url,
                "policySourceDate": policy.source_date,
                "disclaimer": DISCLAIMER,
            }
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="상품 기준을 불러오지 못했습니다.",
                            headers={"Access-Control-Allow-Origin": "*"}) from error

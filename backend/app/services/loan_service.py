"""Disclosed rent deposit loans, each worked out for the user's own amount and term.

The disclosure gives a lowest and highest rate per product; both are shown, because the rate a lender finally gives
depends on credit, guarantee and the contract. Products are sorted by total interest at the lowest rate, which orders
the list and does not say which one to take.
"""

from __future__ import annotations

import re
from datetime import date

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.collectors.finlife_loan import LoanRate
from app.calculators.loan import equal_payment_cost, interest_only_cost
from app.models.loan_product import LoanProduct
from app.schemas.loans import LoanProductRow, LoanProductsRequest, LoanProductsResponse
from app.services.maturity_service import FINLIFE_NAME, FINLIFE_URL
from app.services.product_rate_service import shown_company

GROUPS = {"bank": "은행", "savings_bank": "저축은행"}
REPAY = {"interest_only": "만기일시상환방식", "instalment": "분할상환방식"}
RATE_TYPES = {"fixed": "고정금리", "variable": "변동금리"}
# The guarantee body is only known when the product name says it, e.g. "NH전세대출(서울보증보험)" or "IBK전세대출 (HUG)".
GUARANTEES = {
    "sgi": ("서울보증보험", re.compile(r"서울보증|SGI", re.IGNORECASE)),
    "hf": ("주택금융공사", re.compile(r"주택금융|(?<![A-Za-z])HF(?![A-Za-z])|주금공", re.IGNORECASE)),
    "hug": ("주택도시보증공사", re.compile(r"주택도시|(?<![A-Za-z])HUG(?![A-Za-z])", re.IGNORECASE)),
}


def guarantee_of(product_name: str) -> str:
    for label, pattern in GUARANTEES.values():
        if pattern.search(product_name):
            return label
    return ""

NOTES = [
    "금리는 금융감독원에 공시된 가장 낮은 금리와 가장 높은 금리예요. 내가 받는 금리는 신용·보증·계약 조건을 보고 은행이 정해요.",
    "만기일시상환은 매달 이자만 내고 만기에 원금을 갚는 방식, 분할상환은 원금과 이자를 같은 금액으로 나눠 내는 방식(원리금균등)으로 계산했어요.",
    "보증료, 인지세, 중도상환수수료는 계산에 넣지 않았어요. 상품마다 달라서 펼쳐 보는 내용에서 확인해 주세요.",
    "보증기관(서울보증보험·주택금융공사·주택도시보증공사)은 상품 이름에 적혀 있을 때만 구분했어요. 기관마다 보증료와 대상이 달라서 가입 전에 확인해 주세요.",
    "목록은 총이자가 적은 순서예요. 어떤 상품이 좋다는 뜻이 아니고, 한도·대상·보증 조건이 달라 가입할 수 없을 수 있어요.",
]


def save_loans(session: Session, day: date, loans: list[LoanRate]) -> int:
    """Replace the stored loans with today's disclosure. Nothing is replaced when the disclosure came back empty."""
    if not loans:
        return 0
    session.execute(delete(LoanProduct))
    seen: set[tuple[str, str, str, str]] = set()
    for loan in loans:
        key = (loan.company, loan.product_code, loan.repay_type, loan.rate_type)
        if key in seen:
            continue
        seen.add(key)
        session.add(LoanProduct(
            group=loan.group, company=loan.company, product_code=loan.product_code, product_name=loan.product_name,
            repay_type=loan.repay_type, rate_type=loan.rate_type, rate_min=loan.rate_min, rate_max=loan.rate_max,
            loan_limit=loan.loan_limit, early_repay_fee=loan.early_repay_fee, delay_rate=loan.delay_rate,
            join_way=loan.join_way[:200], disclosed_month=loan.disclosed_month, updated_on=day,
        ))
    session.commit()
    return len(seen)


def loan_products(session: Session, request: LoanProductsRequest) -> LoanProductsResponse:
    conditions = [LoanProduct.group == GROUPS[request.group], LoanProduct.rate_min.is_not(None), LoanProduct.rate_max.is_not(None)]
    if request.repay in REPAY:
        conditions.append(LoanProduct.repay_type == REPAY[request.repay])
    if request.rate_type in RATE_TYPES:
        conditions.append(LoanProduct.rate_type == RATE_TYPES[request.rate_type])
    rows = list(session.scalars(select(LoanProduct).where(*conditions)))
    if request.guarantee in GUARANTEES:
        rows = [row for row in rows if guarantee_of(row.product_name) == GUARANTEES[request.guarantee][0]]
    day = session.scalar(select(func.max(LoanProduct.updated_on)))

    products = []
    for row in rows:
        installment = row.repay_type == REPAY["instalment"]
        cost = equal_payment_cost if installment else interest_only_cost
        low = cost(request.principal, request.months, row.rate_min)
        high = cost(request.principal, request.months, row.rate_max)
        products.append(LoanProductRow(
            company=shown_company(row.company), product_code=row.product_code, product_name=" ".join(row.product_name.split()),
            repay_type=row.repay_type, rate_type=row.rate_type, guarantee=guarantee_of(row.product_name), rate_min=row.rate_min, rate_max=row.rate_max,
            monthly_label="월 상환액" if installment else "월 이자", monthly_min=low.monthly, monthly_max=high.monthly,
            total_interest_min=low.total_interest, total_interest_max=high.total_interest, loan_limit=row.loan_limit,
            early_repay_fee=row.early_repay_fee, delay_rate=row.delay_rate, join_way=row.join_way, disclosed_month=row.disclosed_month,
        ))
    products.sort(key=lambda item: (item.total_interest_min, item.total_interest_max, item.company, item.product_name))
    return LoanProductsResponse(
        principal=request.principal, months=request.months, group=GROUPS[request.group], day=day.isoformat() if isinstance(day, date) else None,
        count=len(products), products=products, notes=NOTES, source_name=FINLIFE_NAME, source_url=FINLIFE_URL,
    )

"""One deposit or savings product: its terms and how each option's disclosed rate moved over the days collected."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models.product_rate import ProductInfo, ProductRateSnapshot
from app.schemas.product_detail import ProductDetailResponse, ProductOption, ProductTerms, RatePointOut
from app.services.maturity_service import FINLIFE_NAME, FINLIFE_URL
from app.services.product_rate_service import KEEP_DAYS, shown_company

NOTES = [
    f"금리는 매일 금융감독원 공시를 모은 기록이고, 최근 {KEEP_DAYS}일 동안 모은 것까지만 보관해요. 모으기 시작하기 전 금리는 알 수 없어요.",
    "공시 금리는 은행이 올린 값이라 실제 가입 시점의 금리와 다를 수 있어요. 가입 전에 은행에서 확인해 주세요.",
    "금리 변화를 보여 줄 뿐 앞으로 오르거나 내릴지는 알 수 없고, 어떤 상품도 권하지 않아요.",
]


def product_detail(session: Session, kind: str, company: str, product_code: str) -> ProductDetailResponse | None:
    rows = [
        row for row in session.scalars(
            select(ProductRateSnapshot)
            .where(ProductRateSnapshot.kind == kind, ProductRateSnapshot.product_code == product_code)
            .order_by(ProductRateSnapshot.day)
        ) if shown_company(row.company) == company
    ]
    if not rows:
        return None
    options: dict[tuple[int, str, str], list[ProductRateSnapshot]] = {}
    for row in rows:
        options.setdefault((row.term_months, row.rate_type, row.reserve_type), []).append(row)
    raw_company = rows[-1].company
    info = session.scalar(select(ProductInfo).where(ProductInfo.kind == kind, ProductInfo.company == raw_company, ProductInfo.product_code == product_code))
    days = sorted({row.day for row in rows})
    latest = rows[-1]
    return ProductDetailResponse(
        kind=kind, company=company, product_code=product_code, product_name=" ".join(latest.product_name.split()), group=latest.group,
        first_day=days[0], last_day=days[-1], days_collected=len(days),
        terms=ProductTerms(
            join_way=info.join_way, join_member=info.join_member, join_limit=info.join_limit, special_conditions=info.special_conditions,
            max_limit=info.max_limit, etc_note=info.etc_note, maturity_interest=info.maturity_interest,
        ) if info else None,
        options=[
            ProductOption(
                term_months=term, rate_type=rate_type or "단리", reserve_type=reserve, disclosed_month=points[-1].disclosed_month,
                history=[RatePointOut(day=point.day, base_rate=point.base_rate, max_rate=point.max_rate) for point in points],
            ) for (term, rate_type, reserve), points in sorted(options.items())
        ],
        notes=NOTES, source_name=FINLIFE_NAME, source_url=FINLIFE_URL,
    )

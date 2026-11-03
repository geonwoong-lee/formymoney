from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.product_detail import ProductDetailResponse
from app.services.product_detail_service import product_detail

router = APIRouter()


@router.get("/product-detail", response_model=ProductDetailResponse)
def get_product_detail(
    request: Request,
    kind: Literal["deposit", "saving"],
    company: str = Query(min_length=1, max_length=100),
    code: str = Query(min_length=1, max_length=60),
) -> ProductDetailResponse:
    try:
        with request.app.state.session_factory() as session:
            detail = product_detail(session, kind, company, code)
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="상품 정보를 불러오지 못했습니다.") from error
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="이 상품의 공시 기록을 찾지 못했습니다.")
    return detail

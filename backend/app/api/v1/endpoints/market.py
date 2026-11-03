from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.market import MarketResponse
from app.services.market_service import MarketService
from app.services.product_rate_service import ProductRateService

router = APIRouter()


@router.get("/market", response_model=MarketResponse)
def get_market(request: Request) -> MarketResponse:
    try:
        with request.app.state.session_factory() as session:
            return MarketService(session).snapshot()
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="시장 지표를 불러오지 못했습니다.",
        ) from error


@router.get("/market/product-rates/changes")
def get_product_rate_changes(request: Request) -> dict[str, object]:
    """Deposit and savings products whose disclosed rate changed since the previous collection day."""
    try:
        with request.app.state.session_factory() as session:
            return {
                **ProductRateService(session).changes(),
                "sourceName": "금융감독원 금융상품 한눈에",
                "sourceUrl": "https://finlife.fss.or.kr/",
            }
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="공시 금리 변동을 불러오지 못했습니다.") from error


class WatchedProduct(BaseModel):
    kind: Literal["deposit", "saving"]
    company: str = Field(min_length=1, max_length=100)
    product_code: str = Field(min_length=1, max_length=60, alias="productCode")


class RateAlertRequest(BaseModel):
    bank_code: str | None = Field(default=None, max_length=30, alias="bankCode")
    # Starred products live in the browser; the list only says which ones to look at.
    watch: list[WatchedProduct] = Field(default_factory=list, max_length=30)


@router.post("/market/product-rates/alerts")
def get_product_rate_alerts(payload: RateAlertRequest, request: Request) -> dict[str, object]:
    """Rate moves since the previous collection day for this person's savings bank and starred products only."""
    try:
        with request.app.state.session_factory() as session:
            return {
                **ProductRateService(session).alerts(payload.bank_code, [(item.kind, item.company, item.product_code) for item in payload.watch]),
                "sourceName": "금융감독원 금융상품 한눈에",
                "sourceUrl": "https://finlife.fss.or.kr/",
            }
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="금리 변동 알림을 불러오지 못했습니다.") from error

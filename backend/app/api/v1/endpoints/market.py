from fastapi import APIRouter, HTTPException, Request, status
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

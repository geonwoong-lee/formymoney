from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.market import MarketResponse
from app.services.market_service import MarketService

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

import hmac
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.daily_briefing import (
    BriefingIngestRequest,
    BriefingIngestResponse,
    DailyBriefingResponse,
)
from app.services.daily_briefing_service import DailyBriefingInputError, DailyBriefingService


router = APIRouter()


def _require_ingest_secret(request: Request, provided_secret: str | None) -> None:
    configured_secret = request.app.state.n8n_ingest_secret
    if not configured_secret:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="내부 브리핑 API 비밀값이 설정되지 않았습니다.",
        )
    if provided_secret is None or not hmac.compare_digest(provided_secret, configured_secret):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="내부 요청 인증에 실패했습니다.",
        )


@router.post("/internal/daily/briefings", response_model=BriefingIngestResponse)
def ingest_daily_briefing(
    payload: BriefingIngestRequest,
    request: Request,
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> BriefingIngestResponse:
    _require_ingest_secret(request, ingest_secret)
    try:
        with request.app.state.session_factory() as session:
            return DailyBriefingService(session).ingest(payload)
    except DailyBriefingInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="브리핑 데이터를 저장하지 못했습니다.",
        ) from error


@router.get("/daily", response_model=DailyBriefingResponse)
def get_daily_briefing(
    request: Request,
    briefing_date: date | None = Query(default=None, alias="date"),
) -> DailyBriefingResponse:
    selected_date = briefing_date or datetime.now(ZoneInfo("Asia/Seoul")).date()
    try:
        with request.app.state.session_factory() as session:
            return DailyBriefingService(session).get_daily(selected_date)
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="오늘의 머니 브리핑을 불러오지 못했습니다.",
        ) from error

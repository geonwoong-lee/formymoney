from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response, status
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.endpoints.daily import _require_ingest_secret
from app.schemas.daily_briefing import CamelModel
from app.services.analytics_service import AnalyticsService
from app.services.news_digest import korea_today

router = APIRouter()

EventName = Literal[
    "visit_conditions", "visit_banks", "visit_cashflow", "check_month_impact", "visit_maturity",
    "plan_maturity", "download_reminder", "visit_daily", "visit_market", "visit_alternatives",
]


class AnalyticsEventRequest(CamelModel):
    event: EventName


@router.post("/analytics/events", status_code=status.HTTP_204_NO_CONTENT)
def record_event(payload: AnalyticsEventRequest, request: Request) -> Response:
    # The browser only sends this after the user agreed; nothing identifying is read or stored.
    key = request.client.host if request.client else "unknown"
    if not request.app.state.analytics_limiter.allow(key):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="잠시 후 다시 보내 주세요.")
    try:
        with request.app.state.session_factory() as session:
            AnalyticsService(session).record(payload.event, korea_today())
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="기록하지 못했습니다.") from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/internal/analytics/funnel")
def get_funnel(
    request: Request,
    days: int = Query(default=30, ge=1, le=365),
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> dict[str, object]:
    _require_ingest_secret(request, ingest_secret)
    try:
        with request.app.state.session_factory() as session:
            return AnalyticsService(session).funnel(korea_today(), days)
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="통계를 불러오지 못했습니다.") from error

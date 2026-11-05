from typing import Literal

from fastapi import APIRouter, Header, HTTPException, Query, Request, Response, status
from pydantic import Field
from sqlalchemy.exc import SQLAlchemyError

from app.api.v1.endpoints.daily import _require_ingest_secret
from app.schemas.daily_briefing import CamelModel
from app.services.analytics_service import AnalyticsService
from app.services.condition_stats import ConditionStatsInputError, ConditionStatsService
from app.services.news_digest import korea_today

router = APIRouter()

EventName = Literal[
    "visit_conditions", "visit_banks", "visit_cashflow", "check_month_impact", "visit_maturity",
    "plan_maturity", "download_reminder", "share_result", "open_shared", "visit_my_savings", "visit_general_savings", "visit_rent_loans", "visit_terms", "visit_daily", "visit_market", "visit_alternatives",
    "visit_early_exit", "check_early_exit",
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


class ConditionAnswersRequest(CamelModel):
    # {은행 코드: {조건 코드: "yes" | "no" | "unknown"}}. 은행 14곳 × 조건 수보다 많을 일이 없어 크기를 제한한다.
    answers: dict[str, dict[str, Literal["yes", "no", "unknown"]]] = Field(max_length=30)


@router.post("/analytics/condition-answers", status_code=status.HTTP_204_NO_CONTENT)
def record_condition_answers(payload: ConditionAnswersRequest, request: Request) -> Response:
    """통계에 동의한 브라우저가 하루 한 번 보내는 우대조건 답. 사람을 구분하는 값 없이 하루 횟수만 늘린다."""
    key = request.client.host if request.client else "unknown"
    if not request.app.state.analytics_limiter.allow(key):
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail="잠시 후 다시 보내 주세요.")
    if sum(len(answers) for answers in payload.answers.values()) > 200:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail="답이 너무 많습니다.")
    try:
        with request.app.state.session_factory() as session:
            ConditionStatsService(session).record(payload.answers, korea_today())
    except ConditionStatsInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="기록하지 못했습니다.") from error
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/analytics/condition-stats")
def get_condition_stats(request: Request) -> dict[str, object]:
    """은행·우대조건별로 "채운다/못 채운다/모른다"고 답한 비율. 응답이 적은 조건은 숨긴다.

    기간은 최근 90일로 고정한다. 기간을 고를 수 있으면 하루 차이 나는 두 기간을 빼서 하루치 응답을 알아낼 수 있다."""
    try:
        with request.app.state.session_factory() as session:
            return ConditionStatsService(session).stats(korea_today())
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="집계를 불러오지 못했습니다.") from error


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

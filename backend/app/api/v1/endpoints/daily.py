import hmac
from datetime import date, datetime
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.daily_briefing import (
    BriefingIngestRequest,
    BriefingIngestResponse,
    CandidateEvidenceRequest,
    CandidateEvidenceResponse,
    DailyCandidateCollectionResponse,
    DailyBriefingResponse,
    EvidenceParagraph,
    NewsHeadlinesResponse,
    OpenAIResultIngestRequest,
)
from app.collectors.official_news import (
    CollectedCandidate,
    OfficialCollectionError,
    collect_candidate_evidence,
    collect_official_candidates,
)
from app.services.daily_candidate_service import DailyCandidateService
from app.services.news_headline_service import NewsHeadlineService
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


@router.get("/internal/daily/candidates/collect", response_model=DailyCandidateCollectionResponse)
def collect_daily_candidates(
    request: Request,
    target_date: date | None = Query(default=None, alias="date"),
    max_candidates: int = Query(default=3, ge=1, le=10, alias="maxCandidates"),
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> DailyCandidateCollectionResponse:
    _require_ingest_secret(request, ingest_secret)
    selected_date = target_date or datetime.now(ZoneInfo("Asia/Seoul")).date()
    collector = getattr(request.app.state, "daily_candidate_collector", collect_official_candidates)
    try:
        batch = collector(selected_date)
        with request.app.state.session_factory() as session:
            return DailyCandidateService(session).prepare(selected_date, batch, max_candidates)
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="수집 후보의 중복 여부를 확인하지 못했습니다.",
        ) from error


@router.post("/internal/daily/candidates/evidence", response_model=CandidateEvidenceResponse)
def prepare_candidate_evidence(
    payload: CandidateEvidenceRequest,
    request: Request,
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> CandidateEvidenceResponse:
    _require_ingest_secret(request, ingest_secret)
    collector = getattr(request.app.state, "daily_evidence_collector", collect_candidate_evidence)
    try:
        result = collector(
            CollectedCandidate(
                source_code=payload.source_code,
                source_item_id=payload.source_item_id,
                original_title=payload.original_title,
                canonical_url=payload.canonical_url,
                published_at=payload.published_at,
            )
        )
    except OfficialCollectionError as error:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="공식 원문에서 요약 근거를 준비하지 못했습니다.",
        ) from error
    return CandidateEvidenceResponse(
        **payload.model_dump(),
        fetched_at=result.fetched_at,
        content_sha256=result.content_sha256,
        evidence=[EvidenceParagraph(id=f"p{index}", text=text) for index, text in enumerate(result.paragraphs, 1)],
    )


@router.post("/internal/daily/briefings/openai-result", response_model=BriefingIngestResponse)
def ingest_openai_result(
    payload: OpenAIResultIngestRequest,
    request: Request,
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> BriefingIngestResponse:
    _require_ingest_secret(request, ingest_secret)
    try:
        with request.app.state.session_factory() as session:
            return DailyBriefingService(session).ingest_openai_result(payload)
    except DailyBriefingInputError as error:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_CONTENT, detail=str(error)) from error
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="AI 브리핑 결과를 저장하지 못했습니다.",
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


@router.get("/daily/headlines", response_model=NewsHeadlinesResponse)
def get_news_headlines(
    request: Request,
    region: str = Query(default="domestic", pattern="^(domestic|international)$"),
    limit: int = Query(default=10, ge=1, le=30),
    featured: bool = Query(default=False),
) -> NewsHeadlinesResponse:
    try:
        with request.app.state.session_factory() as session:
            service = NewsHeadlineService(session)
            items = service.list_featured(region, min(limit, 10)) if featured else service.list_recent(region, limit)
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="뉴스 헤드라인을 불러오지 못했습니다.",
        ) from error
    return NewsHeadlinesResponse(region=region, items=items)

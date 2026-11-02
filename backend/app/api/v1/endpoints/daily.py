import hmac
from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Header, HTTPException, Query, Request, status
from sqlalchemy import select
from sqlalchemy.exc import SQLAlchemyError

from app.models.collection_run import CollectionRun

from app.schemas.daily_briefing import (
    BriefingIngestRequest,
    BriefingIngestResponse,
    CandidateEvidenceRequest,
    CandidateEvidenceResponse,
    DailyCandidateCollectionResponse,
    DailyBriefingResponse,
    EvidenceParagraph,
    NewsDigestResponse,
    NewsHeadlinesResponse,
    OpenAIResultIngestRequest,
)
from app.collectors.official_news import (
    CollectedCandidate,
    OfficialCollectionError,
    collect_candidate_evidence,
    collect_official_candidates,
)
from app.schemas.collection_run import (
    CollectionRunRequest,
    CollectionRunResponse,
    CollectionStatusResponse,
    DailyJobRequest,
    DailyJobResponse,
)
from app.services.collection_run_service import CollectionRunService, RunIdConflictError, sanitize_error_message
from app.services.daily_jobs import JOBS, JobResult
from app.services.daily_candidate_service import DailyCandidateService
from app.services.news_digest import korea_today, todays_digest
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


@router.post("/internal/daily/runs", response_model=CollectionRunResponse)
def record_collection_run(
    payload: CollectionRunRequest,
    request: Request,
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> CollectionRunResponse:
    _require_ingest_secret(request, ingest_secret)
    try:
        with request.app.state.session_factory() as session:
            return CollectionRunService(session, request.app.state.settings.daily_token_limit).record(payload)
    except RunIdConflictError as error:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="같은 runId에 다른 내용의 기록이 이미 있습니다.",
        ) from error
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="수집 실행 기록을 저장하지 못했습니다.",
        ) from error


@router.post("/internal/daily/jobs/{job}", response_model=DailyJobResponse)
def run_daily_job(
    job: str,
    request: Request,
    payload: DailyJobRequest | None = None,
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> DailyJobResponse:
    """Run a daily collection job (called by the n8n schedule) and record the run for operators."""
    _require_ingest_secret(request, ingest_secret)
    jobs = getattr(request.app.state, "daily_jobs", JOBS)
    if job not in jobs:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="알 수 없는 수집 작업입니다.")
    settings = request.app.state.settings
    run_id = f"{payload.run_id}:{job}" if payload and payload.run_id else None
    if run_id:
        # A repeated call for the same n8n execution returns the recorded result instead of collecting again.
        try:
            with request.app.state.session_factory() as session:
                previous = session.scalars(select(CollectionRun).where(CollectionRun.run_id == run_id)).first()
                if previous is not None:
                    return DailyJobResponse(
                        job=job, status=previous.status, attempted=0, collected=previous.candidates,
                        saved=previous.published, failures=[previous.error_message] if previous.error_message else [],
                        notes=["이미 실행된 runId라 다시 수집하지 않았습니다."], run_recorded=True,
                    )
        except SQLAlchemyError as error:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail="수집 실행 기록을 확인하지 못했습니다.",
            ) from error
    started_at = datetime.now(timezone.utc)
    try:
        with request.app.state.session_factory() as session:
            result = jobs[job](settings, session)
    except SQLAlchemyError:
        result = JobResult(job, attempted=1)
        result.fail("DB", "수집 결과를 저장하지 못했습니다.")
    failures = [sanitize_error_message(line) or "" for line in result.failures]
    run = CollectionRunRequest(
        run_id=run_id,
        workflow=f"daily-{job}",
        status=result.status,
        stage=failures[0].split(":")[0][:60] if failures else None,
        error_message="; ".join(failures) or None,
        candidates=min(result.collected, 1_000),
        published=min(result.saved, 1_000),
        rejected=min(len(failures), 1_000),
        started_at=started_at,
        finished_at=datetime.now(timezone.utc),
    )
    try:
        with request.app.state.session_factory() as session:
            CollectionRunService(session, settings.daily_token_limit).record(run)
        recorded = True
    except (RunIdConflictError, SQLAlchemyError):
        recorded = False
    return DailyJobResponse(
        job=job, status=result.status, attempted=result.attempted, collected=result.collected, saved=result.saved,
        failures=failures, notes=result.notes, run_recorded=recorded,
    )


@router.get("/internal/daily/runs/status", response_model=CollectionStatusResponse)
def get_collection_status(
    request: Request,
    ingest_secret: str | None = Header(default=None, alias="X-Very-Rich-Ingest-Secret"),
) -> CollectionStatusResponse:
    _require_ingest_secret(request, ingest_secret)
    try:
        with request.app.state.session_factory() as session:
            return CollectionRunService(session, request.app.state.settings.daily_token_limit).status()
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="수집 실행 상태를 불러오지 못했습니다.",
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


@router.get("/daily/digest", response_model=NewsDigestResponse)
def get_news_digest(request: Request) -> NewsDigestResponse:
    try:
        with request.app.state.session_factory() as session:
            digest = todays_digest(session, korea_today())
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="경제 뉴스 요약을 불러오지 못했습니다.",
        ) from error
    if digest is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="아직 경제 뉴스 요약이 없습니다.")
    return digest


@router.get("/daily/headlines", response_model=NewsHeadlinesResponse)
def get_news_headlines(
    request: Request,
    region: str = Query(default="domestic", pattern="^(domestic|international)$"),
    limit: int = Query(default=10, ge=1, le=30),
    featured: bool = Query(default=False),
    provider: str | None = Query(default=None, pattern="^(naver|fed_press|ecb_press|bok_press)$"),
) -> NewsHeadlinesResponse:
    if featured and provider:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="주요 뉴스(featured)와 출처(provider)는 함께 조회할 수 없습니다.",
        )
    try:
        with request.app.state.session_factory() as session:
            service = NewsHeadlineService(session)
            if featured:
                items = service.list_featured(region, min(limit, 10))
            else:
                items = service.list_recent(region, limit, provider=provider)
    except SQLAlchemyError as error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="뉴스 헤드라인을 불러오지 못했습니다.",
        ) from error
    return NewsHeadlinesResponse(region=region, items=items)

import re
from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.collection_run import CollectionRun
from app.schemas.collection_run import CollectionRunRequest, CollectionRunResponse, CollectionStatusResponse


KST = ZoneInfo("Asia/Seoul")
MAX_ERROR_LENGTH = 300
RECENT_LIMIT = 10

_SECRET_PATTERNS = [
    re.compile(r"sk-[A-Za-z0-9_\-]{8,}"),
    re.compile(r"eyJ[A-Za-z0-9_\-]{10,}(?:\.[A-Za-z0-9_\-]+){0,2}"),
    re.compile(r"(?i)\b(?:bearer|basic)\s+\S+"),
    re.compile(
        r"""(?i)[\w-]*(?:secret|token|password|passwd|api[_-]?key|authorization)[\w-]*["']?\s*[=:]\s*"""
        r"""(?:\[[^\]]*\]|\{[^}]*\}|"[^"]*"|'[^']*'|[^\s"',}]+)"""
    ),
    re.compile(r"[A-Za-z][A-Za-z0-9+.\-]*://[^\s/:@]+:[^\s@]+@"),
]


def sanitize_error_message(message: str | None) -> str | None:
    """Keep operators informed without storing keys, tokens or connection strings."""
    if not message:
        return None
    cleaned = " ".join(message.split())
    for pattern in _SECRET_PATTERNS:
        cleaned = pattern.sub("[가려짐]", cleaned)
    return cleaned[:MAX_ERROR_LENGTH]


def _to_response(run: CollectionRun) -> CollectionRunResponse:
    return CollectionRunResponse(
        id=run.id,
        workflow=run.workflow,
        status=run.status,
        stage=run.stage,
        error_message=run.error_message,
        candidates=run.candidates,
        published=run.published,
        rejected=run.rejected,
        input_tokens=run.input_tokens,
        output_tokens=run.output_tokens,
        started_at=run.started_at,
        finished_at=run.finished_at,
    )


class RunIdConflictError(Exception):
    """The same run_id was sent again with different content."""


def _as_utc(value: datetime) -> datetime:
    # SQLite returns timezone-less values; they were stored as UTC instants.
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value.astimezone(timezone.utc)


def _same_content(run: CollectionRun, payload: CollectionRunRequest) -> bool:
    return (
        _as_utc(run.started_at) == _as_utc(payload.started_at)
        and _as_utc(run.finished_at) == _as_utc(payload.finished_at)
        and
        run.workflow == (sanitize_error_message(payload.workflow) or "")
        and run.status == payload.status
        and run.stage == sanitize_error_message(payload.stage)
        and run.error_message == sanitize_error_message(payload.error_message)
        and (run.candidates, run.published, run.rejected) == (payload.candidates, payload.published, payload.rejected)
        and (run.input_tokens, run.output_tokens) == (payload.input_tokens, payload.output_tokens)
    )


class CollectionRunService:
    def __init__(self, session: Session, daily_token_limit: int) -> None:
        self.session = session
        self.daily_token_limit = daily_token_limit

    def record(self, payload: CollectionRunRequest) -> CollectionRunResponse:
        if payload.run_id:
            existing = self.session.scalars(select(CollectionRun).where(CollectionRun.run_id == payload.run_id)).first()
            if existing is not None:
                return self._replay(existing, payload)
        run = CollectionRun(
            run_id=payload.run_id,
            workflow=sanitize_error_message(payload.workflow) or "",
            status=payload.status,
            stage=sanitize_error_message(payload.stage),
            error_message=sanitize_error_message(payload.error_message),
            candidates=payload.candidates,
            published=payload.published,
            rejected=payload.rejected,
            input_tokens=payload.input_tokens,
            output_tokens=payload.output_tokens,
            started_at=_as_utc(payload.started_at),
            finished_at=_as_utc(payload.finished_at),
        )
        self.session.add(run)
        try:
            self.session.commit()
        except IntegrityError:
            self.session.rollback()
            existing = self.session.scalars(select(CollectionRun).where(CollectionRun.run_id == payload.run_id)).first()
            if existing is None:
                raise
            return self._replay(existing, payload)
        return _to_response(run)

    @staticmethod
    def _replay(existing: CollectionRun, payload: CollectionRunRequest) -> CollectionRunResponse:
        if not _same_content(existing, payload):
            raise RunIdConflictError
        return _to_response(existing)

    def status(self, now: datetime | None = None) -> CollectionStatusResponse:
        now_kst = (now or datetime.now(KST)).astimezone(KST)
        day_start = datetime.combine(now_kst.date(), time.min, tzinfo=KST)
        day_end = _as_utc(day_start + timedelta(days=1))
        day_start = _as_utc(day_start)
        recent = list(
            self.session.scalars(
                select(CollectionRun).order_by(CollectionRun.finished_at.desc(), CollectionRun.id.desc()).limit(RECENT_LIMIT)
            )
        )
        last_success = self._latest("success")
        last_failure = self._latest("failed")
        today_tokens = self.session.scalar(
            select(func.coalesce(func.sum(CollectionRun.input_tokens + CollectionRun.output_tokens), 0)).where(
                CollectionRun.finished_at >= day_start,
                CollectionRun.finished_at < day_end,
            )
        )
        return CollectionStatusResponse(
            latest_status=recent[0].status if recent else None,
            last_success=_to_response(last_success) if last_success else None,
            last_failure=_to_response(last_failure) if last_failure else None,
            recent=[_to_response(run) for run in recent],
            today_tokens=int(today_tokens or 0),
            daily_token_limit=self.daily_token_limit,
            token_limit_exceeded=int(today_tokens or 0) > self.daily_token_limit,
        )

    def _latest(self, status: str) -> CollectionRun | None:
        return self.session.scalars(
            select(CollectionRun)
            .where(CollectionRun.status == status)
            .order_by(CollectionRun.finished_at.desc(), CollectionRun.id.desc())
            .limit(1)
        ).first()

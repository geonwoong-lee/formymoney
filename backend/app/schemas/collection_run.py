from datetime import datetime, timedelta, timezone
from typing import Literal

from pydantic import Field, model_validator

from app.schemas.daily_briefing import CamelModel


class CollectionRunRequest(CamelModel):
    run_id: str | None = Field(default=None, min_length=1, max_length=100)
    workflow: str = Field(min_length=1, max_length=60)
    status: Literal["success", "partial", "failed"]
    stage: str | None = Field(default=None, max_length=60)
    error_message: str | None = Field(default=None, max_length=2_000)
    candidates: int = Field(default=0, ge=0, le=1_000)
    published: int = Field(default=0, ge=0, le=1_000)
    rejected: int = Field(default=0, ge=0, le=1_000)
    input_tokens: int = Field(default=0, ge=0, le=10_000_000)
    output_tokens: int = Field(default=0, ge=0, le=10_000_000)
    started_at: datetime
    finished_at: datetime

    @model_validator(mode="after")
    def validate_times(self) -> "CollectionRunRequest":
        if self.started_at.tzinfo is None or self.finished_at.tzinfo is None:
            raise ValueError("실행 시각에는 시간대가 필요합니다.")
        if self.started_at > self.finished_at:
            raise ValueError("시작 시각이 종료 시각보다 늦습니다.")
        if self.finished_at > datetime.now(timezone.utc) + timedelta(minutes=5):
            raise ValueError("종료 시각이 미래입니다.")
        return self


class DailyJobRequest(CamelModel):
    run_id: str | None = Field(default=None, min_length=1, max_length=80)


class DailyJobResponse(CamelModel):
    job: str
    status: Literal["success", "partial", "failed"]
    attempted: int
    collected: int
    saved: int
    failures: list[str]
    notes: list[str]
    run_recorded: bool


class CollectionRunResponse(CamelModel):
    id: int
    workflow: str
    status: str
    stage: str | None
    error_message: str | None
    candidates: int
    published: int
    rejected: int
    input_tokens: int
    output_tokens: int
    started_at: datetime
    finished_at: datetime


class CollectionStatusResponse(CamelModel):
    latest_status: str | None
    last_success: CollectionRunResponse | None
    last_failure: CollectionRunResponse | None
    recent: list[CollectionRunResponse]
    today_tokens: int
    daily_token_limit: int
    token_limit_exceeded: bool

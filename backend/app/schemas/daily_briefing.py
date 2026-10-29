from datetime import date, datetime
import re
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.health import to_camel


CAUTION_TEXT = "공식 발표를 쉽게 풀어쓴 요약이며 투자·가입 권유가 아닙니다. 원문을 함께 확인하세요."


class CamelModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class EvidenceParagraph(CamelModel):
    id: str = Field(pattern=r"^p[1-9][0-9]*$")
    text: str = Field(min_length=1, max_length=20_000)


class EvidenceText(CamelModel):
    text: str = Field(min_length=1, max_length=1_000)
    evidence_ids: list[str] = Field(min_length=1, max_length=20)

    @field_validator("evidence_ids")
    @classmethod
    def validate_evidence_ids(cls, value: list[str]) -> list[str]:
        if len(value) != len(set(value)) or any(re.fullmatch(r"p[1-9][0-9]*", item) is None for item in value):
            raise ValueError("evidence_ids must contain unique paragraph IDs")
        return value


class StructuredBriefing(CamelModel):
    schema_version: Literal["1.0"]
    source_item_id: str = Field(min_length=1, max_length=255)
    plain_headline: str = Field(min_length=1, max_length=500)
    summary_points: list[EvidenceText] = Field(min_length=1, max_length=3)
    why_it_matters: EvidenceText
    related_terms: list[str] = Field(max_length=3)
    caution: Literal[CAUTION_TEXT]


class BriefingIngestRequest(CamelModel):
    source_code: str = Field(min_length=1, max_length=50)
    source_item_id: str = Field(min_length=1, max_length=255)
    canonical_url: str = Field(min_length=1, max_length=1_000)
    original_title: str = Field(min_length=1, max_length=500)
    published_at: datetime
    fetched_at: datetime
    content_sha256: str = Field(pattern=r"^[0-9a-f]{64}$")
    evidence: list[EvidenceParagraph] = Field(min_length=1, max_length=100)
    summary: StructuredBriefing
    model_name: str = Field(min_length=1, max_length=120)
    prompt_version: str = Field(min_length=1, max_length=50)
    generated_at: datetime
    input_tokens: int = Field(ge=0)
    output_tokens: int = Field(ge=0)

    @field_validator("published_at", "fetched_at", "generated_at")
    @classmethod
    def require_timezone(cls, value: datetime) -> datetime:
        if value.tzinfo is None or value.utcoffset() is None:
            raise ValueError("datetime must include timezone")
        return value

    @field_validator("evidence")
    @classmethod
    def evidence_ids_must_be_unique(cls, value: list[EvidenceParagraph]) -> list[EvidenceParagraph]:
        ids = [item.id for item in value]
        if len(ids) != len(set(ids)):
            raise ValueError("evidence IDs must be unique")
        return value


class BriefingIngestResponse(CamelModel):
    id: int
    status: Literal["draft", "validated", "published", "rejected"]
    duplicate: bool
    validation_errors: list[str]


class SummaryPointResponse(CamelModel):
    text: str
    evidence_ids: list[str]


class DailyBriefingItemResponse(CamelModel):
    id: int
    source_code: str
    source_name: str
    source_item_id: str
    original_title: str
    canonical_url: str
    published_at: datetime
    generated_at: datetime
    plain_headline: str
    summary_points: list[SummaryPointResponse]
    why_it_matters: SummaryPointResponse
    related_terms: list[str]
    caution: str
    ai_generated: Literal[True] = True


class FinancialTermResponse(CamelModel):
    slug: str
    name: str
    short_definition: str
    example: str
    source_name: str
    source_url: str


class DailyBriefingResponse(CamelModel):
    date: date
    generated_at: datetime | None
    items: list[DailyBriefingItemResponse]
    term: FinancialTermResponse | None


class DailyCandidateResponse(CamelModel):
    source_code: str
    source_name: str
    source_item_id: str
    original_title: str
    canonical_url: str
    published_at: datetime
    usage_status: Literal["summary_allowed", "discovery_only"]
    eligible_for_summary: bool


class CandidateSourceResult(CamelModel):
    source_code: str
    status: Literal["ok", "fallback", "failed"]
    candidate_count: int
    detail: str


class DailyCandidateCollectionResponse(CamelModel):
    target_date: date
    generated_at: datetime
    status: Literal["ok", "partial", "all_failed", "no_candidates"]
    candidates: list[DailyCandidateResponse]
    duplicate_count: int
    source_results: list[CandidateSourceResult]

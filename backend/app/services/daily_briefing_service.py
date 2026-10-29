import re
from datetime import date, datetime, timezone
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy.orm import Session

from app.data.daily_sources import DAILY_SOURCE_POLICIES
from app.models.daily_briefing import DailyBriefingItem, DailyBriefingSource
from app.repositories.daily_briefing_repository import DailyBriefingRepository
from app.schemas.daily_briefing import (
    BriefingIngestRequest,
    BriefingIngestResponse,
    DailyBriefingItemResponse,
    DailyBriefingResponse,
    FinancialTermResponse,
    SummaryPointResponse,
)


FORBIDDEN_EXPRESSIONS = (
    "추천",
    "사야 한다",
    "팔아야 한다",
    "무조건",
    "확실",
    "수익 보장",
    "손실 없음",
)
NUMBER_PATTERN = re.compile(r"(?<![A-Za-z])[-+]?\d[\d,]*(?:\.\d+)?")


class DailyBriefingInputError(ValueError):
    pass


class DailyBriefingService:
    def __init__(self, session: Session) -> None:
        self.repository = DailyBriefingRepository(session)

    def ingest(self, payload: BriefingIngestRequest) -> BriefingIngestResponse:
        source = self._get_or_create_source(payload.source_code)
        canonical_url = self._normalize_and_validate_url(payload.canonical_url, source)
        existing = self.repository.find_duplicate(
            source.id,
            payload.source_item_id,
            canonical_url,
            payload.content_sha256,
        )
        if existing is not None and existing.status != "rejected":
            return BriefingIngestResponse(
                id=existing.id,
                status=existing.status,
                duplicate=True,
                validation_errors=existing.validation_errors,
            )

        validation_errors = self._validate_content(payload, source)
        item = existing or DailyBriefingItem(source_id=source.id)
        self._apply_payload(item, payload, canonical_url, validation_errors)
        if existing is None:
            self.repository.add_item(item)
        self.repository.commit()
        return BriefingIngestResponse(
            id=item.id,
            status=item.status,
            duplicate=existing is not None,
            validation_errors=item.validation_errors,
        )

    def get_daily(self, briefing_date: date) -> DailyBriefingResponse:
        items = self.repository.list_published_for_date(briefing_date)
        assignment = self.repository.get_term_assignment(briefing_date)
        generated_at = max((item.generated_at for item in items), default=None)
        term = None
        if assignment is not None:
            term = FinancialTermResponse(
                slug=assignment.term.slug,
                name=assignment.term.name,
                short_definition=assignment.term.short_definition,
                example=assignment.term.example,
                source_name=assignment.term.source_name,
                source_url=assignment.term.source_url,
            )
        return DailyBriefingResponse(
            date=briefing_date,
            generated_at=generated_at,
            items=[self._item_response(item) for item in items],
            term=term,
        )

    def _get_or_create_source(self, source_code: str) -> DailyBriefingSource:
        policy = DAILY_SOURCE_POLICIES.get(source_code)
        if policy is None:
            raise DailyBriefingInputError("허용되지 않은 공식 출처입니다.")
        source = self.repository.get_source(source_code)
        if source is not None:
            return source
        return self.repository.add_source(DailyBriefingSource(code=source_code, **policy))

    @staticmethod
    def _normalize_and_validate_url(url: str, source: DailyBriefingSource) -> str:
        parts = urlsplit(url.strip())
        host = (parts.hostname or "").lower()
        if parts.scheme != "https" or parts.username or parts.password:
            raise DailyBriefingInputError("공식 원문 URL은 인증정보가 없는 HTTPS 주소여야 합니다.")
        if host != source.allowed_host or not parts.path.startswith(source.allowed_path_prefix):
            raise DailyBriefingInputError("공식 출처의 허용된 경로가 아닙니다.")
        query = urlencode(sorted(parse_qsl(parts.query, keep_blank_values=True)))
        return urlunsplit(("https", host, parts.path, query, ""))

    @staticmethod
    def _validate_content(payload: BriefingIngestRequest, source: DailyBriefingSource) -> list[str]:
        errors: list[str] = []
        if not source.active or not source.summary_allowed:
            errors.append("이 출처는 AI 요약 공개가 허용되지 않았습니다.")
        if payload.summary.source_item_id != payload.source_item_id:
            errors.append("요약의 출처 식별자가 원문 식별자와 다릅니다.")
        if payload.published_at > datetime.now(timezone.utc):
            errors.append("미래 발표일은 게시할 수 없습니다.")
        if payload.fetched_at < payload.published_at:
            errors.append("수집 시각이 발표 시각보다 빠릅니다.")
        if payload.generated_at < payload.fetched_at:
            errors.append("AI 생성 시각이 수집 시각보다 빠릅니다.")

        evidence = {item.id: item.text for item in payload.evidence}
        generated_parts = [payload.summary.plain_headline]
        generated_parts.extend(item.text for item in payload.summary.summary_points)
        generated_parts.append(payload.summary.why_it_matters.text)
        generated_text = " ".join(generated_parts)
        for expression in FORBIDDEN_EXPRESSIONS:
            if expression in generated_text:
                errors.append(f"금지 표현이 포함됐습니다: {expression}")

        evidence_text = " ".join(evidence.values())
        errors.extend(DailyBriefingService._validate_numbers(payload.summary.plain_headline, evidence_text))
        for item in [*payload.summary.summary_points, payload.summary.why_it_matters]:
            missing_ids = [evidence_id for evidence_id in item.evidence_ids if evidence_id not in evidence]
            if missing_ids:
                errors.append(f"존재하지 않는 근거 문단입니다: {', '.join(missing_ids)}")
                continue
            linked_text = " ".join(evidence[evidence_id] for evidence_id in item.evidence_ids)
            errors.extend(DailyBriefingService._validate_numbers(item.text, linked_text))
        return list(dict.fromkeys(errors))

    @staticmethod
    def _validate_numbers(generated_text: str, evidence_text: str) -> list[str]:
        evidence_numbers = {token.replace(",", "") for token in NUMBER_PATTERN.findall(evidence_text)}
        errors = []
        for token in NUMBER_PATTERN.findall(generated_text):
            normalized = token.replace(",", "")
            if normalized not in evidence_numbers:
                errors.append(f"근거에서 확인되지 않는 숫자입니다: {token}")
        return errors

    @staticmethod
    def _apply_payload(
        item: DailyBriefingItem,
        payload: BriefingIngestRequest,
        canonical_url: str,
        validation_errors: list[str],
    ) -> None:
        item.source_item_id = payload.source_item_id
        item.canonical_url = canonical_url
        item.original_title = payload.original_title
        item.published_at = payload.published_at
        item.fetched_at = payload.fetched_at
        item.content_sha256 = payload.content_sha256
        item.status = "rejected" if validation_errors else "published"
        item.validation_errors = validation_errors
        item.plain_headline = payload.summary.plain_headline
        item.summary_points = [point.model_dump() for point in payload.summary.summary_points]
        item.why_it_matters = payload.summary.why_it_matters.model_dump()
        item.related_terms = payload.summary.related_terms
        item.caution = payload.summary.caution
        item.schema_version = payload.summary.schema_version
        item.model_name = payload.model_name
        item.prompt_version = payload.prompt_version
        item.generated_at = payload.generated_at
        item.input_tokens = payload.input_tokens
        item.output_tokens = payload.output_tokens

    @staticmethod
    def _item_response(item: DailyBriefingItem) -> DailyBriefingItemResponse:
        return DailyBriefingItemResponse(
            id=item.id,
            source_code=item.source.code,
            source_name=item.source.name,
            source_item_id=item.source_item_id,
            original_title=item.original_title,
            canonical_url=item.canonical_url,
            published_at=item.published_at,
            generated_at=item.generated_at,
            plain_headline=item.plain_headline,
            summary_points=[SummaryPointResponse(**point) for point in item.summary_points],
            why_it_matters=SummaryPointResponse(**item.why_it_matters),
            related_terms=item.related_terms,
            caution=item.caution,
        )

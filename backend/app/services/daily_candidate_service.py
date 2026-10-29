from datetime import date, datetime, timezone

from sqlalchemy.orm import Session

from app.collectors.official_news import CollectionBatch
from app.data.daily_sources import DAILY_SOURCE_POLICIES
from app.models.daily_briefing import DailyBriefingSource
from app.repositories.daily_briefing_repository import DailyBriefingRepository
from app.schemas.daily_briefing import (
    CandidateSourceResult,
    DailyCandidateCollectionResponse,
    DailyCandidateResponse,
)
from app.services.daily_briefing_service import DailyBriefingInputError, DailyBriefingService


class DailyCandidateService:
    def __init__(self, session: Session) -> None:
        self.repository = DailyBriefingRepository(session)
        self.session = session

    def prepare(self, target_date: date, batch: CollectionBatch, max_candidates: int) -> DailyCandidateCollectionResponse:
        candidates: list[DailyCandidateResponse] = []
        duplicate_count = 0
        source_results: list[CandidateSourceResult] = []

        for result in batch.results:
            accepted_for_source = 0
            policy = DAILY_SOURCE_POLICIES.get(result.source_code)
            if policy is None:
                continue
            source = self.repository.get_source(result.source_code)
            if source is None:
                source = self.repository.add_source(DailyBriefingSource(code=result.source_code, **policy))

            for candidate in result.candidates:
                try:
                    canonical_url = DailyBriefingService._normalize_and_validate_url(candidate.canonical_url, source)
                except DailyBriefingInputError:
                    continue
                if self.repository.find_metadata_duplicate(source.id, candidate.source_item_id, canonical_url):
                    duplicate_count += 1
                    continue
                if source.usage_status not in {"summary_allowed", "discovery_only"}:
                    continue
                candidates.append(
                    DailyCandidateResponse(
                        source_code=source.code,
                        source_name=source.name,
                        source_item_id=candidate.source_item_id,
                        original_title=candidate.original_title,
                        canonical_url=canonical_url,
                        published_at=candidate.published_at,
                        usage_status=source.usage_status,
                        eligible_for_summary=source.summary_allowed,
                    )
                )
                accepted_for_source += 1
            source_results.append(
                CandidateSourceResult(
                    source_code=result.source_code,
                    status=result.status,
                    candidate_count=accepted_for_source,
                    detail=result.detail,
                )
            )

        self.session.commit()
        candidates.sort(key=lambda item: item.published_at, reverse=True)
        summary_candidates = [item for item in candidates if item.eligible_for_summary][:max_candidates]
        discovery_candidates = [item for item in candidates if not item.eligible_for_summary][:max_candidates]
        limited_candidates = summary_candidates + discovery_candidates
        failed_count = sum(result.status == "failed" for result in source_results)
        if failed_count == len(source_results):
            status = "all_failed"
        elif failed_count:
            status = "partial"
        elif not limited_candidates:
            status = "no_candidates"
        else:
            status = "ok"
        return DailyCandidateCollectionResponse(
            target_date=target_date,
            generated_at=datetime.now(timezone.utc),
            status=status,
            candidates=limited_candidates,
            duplicate_count=duplicate_count,
            source_results=source_results,
        )

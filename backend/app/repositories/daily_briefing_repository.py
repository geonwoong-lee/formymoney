from datetime import date, datetime, time
from zoneinfo import ZoneInfo

from sqlalchemy import or_, select
from sqlalchemy.orm import Session, joinedload

from app.models.daily_briefing import (
    DailyBriefingItem,
    DailyBriefingSource,
    DailyTermAssignment,
    FinancialTerm,
)

KST = ZoneInfo("Asia/Seoul")


class DailyBriefingRepository:
    def __init__(self, session: Session) -> None:
        self.session = session

    def get_source(self, code: str) -> DailyBriefingSource | None:
        return self.session.scalar(select(DailyBriefingSource).where(DailyBriefingSource.code == code))

    def add_source(self, source: DailyBriefingSource) -> DailyBriefingSource:
        self.session.add(source)
        self.session.flush()
        return source

    def find_duplicate(
        self,
        source_id: int,
        source_item_id: str,
        canonical_url: str,
        content_sha256: str,
    ) -> DailyBriefingItem | None:
        return self.session.scalar(
            select(DailyBriefingItem)
            .options(joinedload(DailyBriefingItem.source))
            .where(
                or_(
                    (DailyBriefingItem.source_id == source_id)
                    & (DailyBriefingItem.source_item_id == source_item_id),
                    DailyBriefingItem.canonical_url == canonical_url,
                    DailyBriefingItem.content_sha256 == content_sha256,
                )
            )
            .order_by(DailyBriefingItem.id)
        )

    def add_item(self, item: DailyBriefingItem) -> DailyBriefingItem:
        self.session.add(item)
        self.session.flush()
        return item

    def find_metadata_duplicate(
        self,
        source_id: int,
        source_item_id: str,
        canonical_url: str,
    ) -> DailyBriefingItem | None:
        return self.session.scalar(
            select(DailyBriefingItem).where(
                or_(
                    (DailyBriefingItem.source_id == source_id)
                    & (DailyBriefingItem.source_item_id == source_item_id),
                    DailyBriefingItem.canonical_url == canonical_url,
                )
            )
        )

    def list_published_for_date(self, briefing_date: date, limit: int = 3) -> list[DailyBriefingItem]:
        start = datetime.combine(briefing_date, time.min, tzinfo=KST)
        end = datetime.combine(briefing_date, time.max, tzinfo=KST)
        query = (
            select(DailyBriefingItem)
            .options(joinedload(DailyBriefingItem.source))
            .where(
                DailyBriefingItem.status == "published",
                DailyBriefingItem.published_at >= start,
                DailyBriefingItem.published_at <= end,
            )
            .order_by(DailyBriefingItem.published_at.desc(), DailyBriefingItem.id.desc())
            .limit(limit)
        )
        return list(self.session.scalars(query).all())

    def get_term_assignment(self, briefing_date: date) -> DailyTermAssignment | None:
        query = (
            select(DailyTermAssignment)
            .options(joinedload(DailyTermAssignment.term))
            .where(DailyTermAssignment.briefing_date == briefing_date)
        )
        assignment = self.session.scalar(query)
        if assignment is None or not assignment.term.is_reviewed:
            return None
        return assignment

    def list_reviewed_terms(self) -> list[FinancialTerm]:
        query = select(FinancialTerm).where(FinancialTerm.is_reviewed.is_(True)).order_by(FinancialTerm.id)
        return list(self.session.scalars(query).all())

    def commit(self) -> None:
        self.session.commit()

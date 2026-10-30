from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.collectors.naver_news import Headline
from app.models.daily_briefing import NewsHeadline
from app.schemas.daily_briefing import NewsHeadlineResponse

HEADLINE_RETENTION_DAYS = 21


class NewsHeadlineService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save(self, provider: str, region: str, topic: str, headlines: list[Headline], now: datetime | None = None) -> int:
        fetched_at = now or datetime.now(timezone.utc)
        known = set(self.session.scalars(select(NewsHeadline.url).where(NewsHeadline.url.in_([h.url for h in headlines]))))
        added = 0
        for headline in headlines:
            if headline.url in known:
                continue
            known.add(headline.url)
            self.session.add(NewsHeadline(
                provider=provider, region=region, topic=topic, title=headline.title,
                publisher=headline.publisher, url=headline.url,
                published_at=headline.published_at, fetched_at=fetched_at,
            ))
            added += 1
        self.session.commit()
        return added

    def pending_interpretation(self, region: str, limit: int) -> list[NewsHeadline]:
        return list(self.session.scalars(
            select(NewsHeadline)
            .where(NewsHeadline.region == region, NewsHeadline.title_ko.is_(None))
            .order_by(NewsHeadline.published_at.desc())
            .limit(limit)
        ).all())

    def store_interpretation(self, headline: NewsHeadline, title_ko: str, summary_ko: str, model: str) -> None:
        headline.title_ko = title_ko
        headline.summary_ko = summary_ko
        headline.ai_model = model
        self.session.commit()

    def purge_expired(self, now: datetime | None = None) -> int:
        cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=HEADLINE_RETENTION_DAYS)
        result = self.session.execute(delete(NewsHeadline).where(NewsHeadline.fetched_at < cutoff))
        self.session.commit()
        return result.rowcount or 0

    def list_recent(self, region: str, limit: int = 10, now: datetime | None = None) -> list[NewsHeadlineResponse]:
        cutoff = (now or datetime.now(timezone.utc)) - timedelta(days=HEADLINE_RETENTION_DAYS)
        rows = self.session.scalars(
            select(NewsHeadline)
            .where(NewsHeadline.region == region, NewsHeadline.fetched_at >= cutoff)
            .order_by(NewsHeadline.published_at.desc(), NewsHeadline.id.desc())
            .limit(limit)
        ).all()
        return [
            NewsHeadlineResponse(
                title=row.title, publisher=row.publisher, url=row.url,
                published_at=row.published_at, topic=row.topic, provider=row.provider,
                title_ko=row.title_ko, summary_ko=row.summary_ko,
            )
            for row in rows
        ]

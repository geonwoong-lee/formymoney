"""Collect finance headlines (title and link only) and drop expired rows.

Domestic: Naver news search API (needs the Naver keys in backend/.env).
International: official central bank RSS feeds (no key needed).
Run once a day (Task Scheduler, cron or n8n).
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.collectors.naver_news import NaverNewsError, fetch_headlines  # noqa: E402
from app.collectors.official_rss import OFFICIAL_FEEDS, OfficialRssError, fetch_feed  # noqa: E402
from app.core.config import get_settings  # noqa: E402
from app.db.session import create_database_engine, create_session_factory, require_postgres_url  # noqa: E402
from app.collectors.press_text import PressTextError, fetch_paragraphs  # noqa: E402
from app.services.headline_interpreter import InterpretationError, interpret  # noqa: E402
from app.services.news_headline_service import NewsHeadlineService  # noqa: E402

TOPICS = ["예금 금리", "적금", "기준금리", "청년미래적금", "금융당국", "가계대출"]


def interpret_international(settings, service: NewsHeadlineService, limit: int = 10) -> None:
    if not settings.openai_api_key:
        print("[해석] VERY_RICH_OPENAI_API_KEY가 없어 해외 헤드라인 한국어 해석을 건너뜁니다.")
        return
    done = skipped = 0
    for headline in service.pending_interpretation("international", limit):
        try:
            paragraphs = fetch_paragraphs(headline.url)
            result = interpret(settings, headline.title, headline.publisher, paragraphs)
        except (PressTextError, InterpretationError) as error:
            print(f"[해석] 건너뜀: {headline.title[:50]} ({error})")
            skipped += 1
            continue
        service.store_interpretation(headline, result.title_ko, result.summary_ko, result.model)
        done += 1
    print(f"[해석] 완료 {done}건, 건너뜀 {skipped}건")


def main() -> int:
    settings = get_settings()
    engine = create_database_engine(require_postgres_url(settings.database_url))
    attempts = failures = 0
    with create_session_factory(engine)() as session:
        service = NewsHeadlineService(session)
        for topic in TOPICS:
            attempts += 1
            try:
                headlines = fetch_headlines(settings, topic)
            except NaverNewsError as error:
                print(f"[네이버:{topic}] 건너뜀: {error}")
                failures += 1
                continue
            print(f"[네이버:{topic}] 수집 {len(headlines)}건, 새로 저장 {service.save('naver', 'domestic', topic, headlines)}건")
        for feed in OFFICIAL_FEEDS:
            attempts += 1
            try:
                headlines = fetch_feed(feed)
            except OfficialRssError as error:
                print(f"[{feed.code}] 건너뜀: {error}")
                failures += 1
                continue
            print(f"[{feed.code}] 수집 {len(headlines)}건, 새로 저장 {service.save(feed.code, 'international', feed.publisher, headlines)}건")
        interpret_international(settings, service)
        print(f"만료된 헤드라인 {service.purge_expired()}건 삭제")
    return 1 if failures == attempts else 0


if __name__ == "__main__":
    raise SystemExit(main())

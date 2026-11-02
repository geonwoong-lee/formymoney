"""Collect finance headlines (title and link only), interpret official releases and write today's digest.

Domestic: Naver news search API (needs the Naver keys in backend/.env).
International: official central bank RSS feeds (no key needed).
Then an AI-written economy news digest for today (needs the OpenAI key).
Run once a day (n8n calls the same job through POST /api/v1/internal/daily/jobs/news).
Exit code: 0 success, 2 partial, 1 failed.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.db.session import create_database_engine, create_session_factory, require_postgres_url  # noqa: E402
from app.services.daily_jobs import print_result, run_news_job  # noqa: E402


def main() -> int:
    settings = get_settings()
    engine = create_database_engine(require_postgres_url(settings.database_url))
    with create_session_factory(engine)() as session:
        return print_result(run_news_job(settings, session))


if __name__ == "__main__":
    raise SystemExit(main())

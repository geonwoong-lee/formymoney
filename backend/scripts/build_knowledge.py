"""Rebuild 머니독's knowledge base from the site guide, terms, digests and market values.

Only new or changed chunks are embedded again. The daily n8n jobs already do this at the end of each run;
use this after changing the guide or term explanations. Needs VERY_RICH_OPENAI_API_KEY.
"""

from __future__ import annotations

import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.db.session import create_database_engine, create_session_factory, require_postgres_url  # noqa: E402
from app.services.knowledge_base import sync  # noqa: E402
from app.services.openai_client import OpenAIError, embed_texts  # noqa: E402


def main() -> int:
    settings = get_settings()
    engine = create_database_engine(require_postgres_url(settings.database_url))
    with create_session_factory(engine)() as session:
        try:
            result = sync(session, lambda texts: embed_texts(settings, texts))
        except OpenAIError as error:
            print(f"도우미 자료를 만들지 못했습니다: {error}")
            return 1
    print(f"도우미 자료 {result.total}개 (새로 임베딩 {result.embedded}, 삭제 {result.removed})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

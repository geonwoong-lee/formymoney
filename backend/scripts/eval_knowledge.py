"""Measure how well 머니독's search finds the right knowledge chunk.

Each question in evals/knowledge_questions.json lists acceptable source_key prefixes; "{today}" and
"{yesterday}" stand for the Korean date the evaluation runs (or --today). Reports hit@1, hit@5 and MRR
for plain vector search, day-aware search, and the hybrid (day-aware + letter overlap) search the assistant uses. Needs VERY_RICH_OPENAI_API_KEY.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import date, timedelta
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.db.session import create_database_engine, create_session_factory, require_postgres_url  # noqa: E402
from app.services.knowledge_base import retrieve  # noqa: E402
from app.services.news_digest import korea_today  # noqa: E402
from app.services.openai_client import embed_texts  # noqa: E402

QUESTIONS = BACKEND_DIR / "evals" / "knowledge_questions.json"


def score(ranked_keys: list[str], expected: list[str]) -> tuple[bool, bool, float]:
    rank = next((index for index, key in enumerate(ranked_keys, 1) if any(key.startswith(prefix) for prefix in expected)), None)
    return rank == 1, rank is not None and rank <= 5, 1 / rank if rank else 0.0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--today", type=date.fromisoformat, help="평가 기준일(기본: 한국 날짜 오늘)")
    parser.add_argument("--verbose", action="store_true", help="질문마다 상위 결과 출력")
    args = parser.parse_args()
    today = args.today or korea_today()
    fill = {"today": today.isoformat(), "yesterday": (today - timedelta(days=1)).isoformat()}
    cases = json.loads(QUESTIONS.read_text(encoding="utf-8"))

    settings = get_settings()
    cache: dict[str, list[float]] = {}

    def embed(texts: list[str]) -> list[list[float]]:
        missing = [text for text in texts if text not in cache]
        if missing:
            cache.update(zip(missing, embed_texts(settings, missing)))
        return [cache[text] for text in texts]

    engine = create_database_engine(require_postgres_url(settings.database_url))
    with create_session_factory(engine)() as session:
        for label, day_aware, lexical in (("벡터 검색만", False, False), ("날짜 반영", True, False), ("날짜 반영 + 글자 일치(하이브리드)", True, True)):
            totals = [0, 0, 0.0]
            for case in cases:
                expected = [prefix.format(**fill) for prefix in case["expected"]]
                ranked = [item.chunk.source_key for item in retrieve(session, case["question"], embed, today, 5, day_aware, lexical)]
                top1, top5, reciprocal = score(ranked, expected)
                totals[0] += top1
                totals[1] += top5
                totals[2] += reciprocal
                if args.verbose and not top1:
                    print(f"  [{label}] {case['question']} -> {ranked[:3]} (기대 {expected})")
            count = len(cases)
            print(f"{label}: 질문 {count}개, hit@1 {totals[0] / count:.0%}, hit@5 {totals[1] / count:.0%}, MRR {totals[2] / count:.2f}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

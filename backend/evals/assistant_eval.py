"""Measure 머니독 on a fixed set of questions, in-process (same steps as the endpoint, no rate limit).

Uses the real database and the real OpenAI key, so it costs a few cents and is run by hand, not by pytest:
    cd backend && PYTHONPATH=. python evals/assistant_eval.py
Each answer is marked FAIL (the server refused it), honest-unknown (said the data is missing) or answered; read the
honest-unknown ones, they are the questions the site could not answer yet.
"""
import sys
import time
from concurrent.futures import ThreadPoolExecutor

from app.core.config import get_settings
from app.db.session import create_database_engine, create_session_factory
from app.services import assistant_chat as ac
from app.services.assistant_tools import FOLLOW_UP_LENGTH, run_tools
from app.services.knowledge_base import retrieve
from app.services.news_digest import korea_today
from app.services.openai_client import embed_texts

QUESTIONS = [
    ("site", "내 조건은 어디에 입력해?"), ("site", "은행 비교 화면에서는 뭘 볼 수 있어?"), ("site", "이번 달 납입을 못 했는데 어떻게 계산돼?"),
    ("concept", "단리랑 복리 차이가 뭐야?"), ("concept", "예금자보호가 뭐야?"), ("concept", "이자소득세는 얼마나 떼?"), ("concept", "비과세종합저축이 뭐야?"),
    ("data", "요즘 환율 어때?"), ("data", "코스피 얼마야?"), ("data", "기준금리 얼마야?"), ("data", "다음 금통위 언제야?"), ("data", "오늘 주요 경제 뉴스 알려줘"), ("data", "나스닥 어때?"),
    ("tool", "서울 월세 지원 정책 있어?"), ("tool", "27살인데 받을 수 있는 취업 지원 알려줘"), ("tool", "전세대출 금리 알려줘"),
    ("tool", "월 50만원 12개월 연 3.5% 적금이면 얼마 모여?"), ("tool", "1000만원 1년 예금 3%면 이자가 얼마야?"),
    ("product", "우리은행 정기예금 금리 알려줘"), ("product", "금리 높은 적금 알려줘"), ("product", "청년미래적금 금리가 몇 퍼센트야?"), ("product", "6개월 정기예금 금리 상위 보여줘"),
    ("policy", "청년 월세 지원은 어떻게 신청해?"), ("policy", "청년도약계좌랑 청년미래적금 뭐가 달라?"),
    ("edge", "안녕"), ("edge", "너 뭐 할 수 있어?"), ("edge", "오늘 날씨 어때?"), ("edge", "삼성전자 주가 알려줘"), ("edge", "어떤 은행이 제일 좋아?"),
    ("new", "청년정책 중에 대출 이자 지원 있어?"), ("new", "S&P500 지수 알려줘"), ("new", "다음 달에 기준금리 오를까?"), ("new", "내 적금 만기 알림은 어떻게 받아?"),
    ("new", "월 100만원 36개월 연 3% 적금 만기금액이 얼마야?"), ("new", "전세대출 1억5천 2년이면 금리가 어때?"), ("new", "코스닥은?"), ("new", "달러 환율 얼마야?"),
    ("new", "국민은행 적금 금리 알려줘"), ("new", "저축은행 정기예금 금리 어때?"), ("new", "경기도 청년 주거 지원 알려줘"), ("new", "물가 얼마나 올랐어?"),
]
HONEST = ("모르", "없", "어렵", "부족", "찾지 못")

settings = get_settings()
factory = create_session_factory(create_database_engine(settings.database_url))


def ask_one(item):
    kind, message = item
    started = time.time()
    with factory() as session:
        try:
            retrieved = retrieve(session, message, lambda t: embed_texts(settings, t), korea_today())
        except Exception as error:  # noqa: BLE001
            return kind, message, "ERR", f"retrieve {type(error).__name__}", [], 0
        context, sources = ac.build_rag_context(retrieved) if retrieved else (ac.build_context(session), {})
        tools = run_tools(session, message, [])
        context, sources = ac.add_tool_results(context, sources, tools)
    reply = ac.answer_question(settings, message, context, ac._call, sources)
    return kind, message, reply.source, reply.answer, [t.title for t in tools], round(time.time() - started, 1)


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(ask_one, QUESTIONS))
    stats = {"ai": 0, "unavailable": 0, "rule": 0, "ERR": 0}
    for kind, message, source, answer, tools, seconds in results:
        stats[source] = stats.get(source, 0) + 1
        honest = source == "ai" and any(word in answer[:80] for word in HONEST)
        flag = "FAIL" if source in ("unavailable", "ERR") else ("honest-unknown" if honest else "answered")
        print(f"[{flag}] ({kind}) {message}  [{seconds}s tools={tools}]\n      {answer[:230]}")
    print("\nSUMMARY", stats)

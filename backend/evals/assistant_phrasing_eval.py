"""The same intents as assistant_eval.py, phrased the way people actually type; each question names the tool that must fire.

Run by hand (real database and OpenAI key): cd backend && PYTHONPATH=. python evals/assistant_phrasing_eval.py
A MISS means the wrong tool fired, or none, or the server refused the answer.
"""
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import assistant_eval as base  # noqa: E402

# (expected tool title or None, question)
QUESTIONS = [
    ("청년정책 조회", "월세 보조금 받을 수 있는 거 있나요"), ("청년정책 조회", "집 구할 때 도와주는 제도 알려주세요"), ("청년정책 조회", "서울 사는 취준생인데 받을 수 있는 혜택이 뭐가 있어"),
    ("청년정책 조회", "신혼부부 지원금 있어?"), ("청년정책 조회", "대학생 학자금 도와주는 거 찾아줘"), ("청년정책 조회", "청년 창업하려는데 지원해주는 곳 있어?"),
    ("전세자금대출 조회", "전세 3억 빌리면 이자가 얼마나 나와요?"), ("전세자금대출 조회", "전월세 대출 어디가 싸?"), ("전세자금대출 조회", "집 보증금 대출 이율 알려줘"),
    ("이자 계산", "적금 매달 20만원씩 2년 넣으면 4% 기준으로 얼마 돼요?"), ("이자 계산", "5백만원 예금 6개월 맡기면 이자 얼마야 3%로"), ("이자 계산", "한 달에 50만원 1년 적금 연 3.2프로면 만기에 얼마?"),
    ("예적금 금리 조회", "예금 이자 많이 주는 곳 알려줘"), ("예적금 금리 조회", "신한 적금 이율이 어떻게 되나요"), ("예적금 금리 조회", "카카오뱅크 예금 금리"), ("예적금 금리 조회", "12개월 적금 이율 비교해줘"),
    ("시장 지표 조회", "지금 달러 얼마예요"), ("시장 지표 조회", "엔화 환율 알려줘"), ("시장 지표 조회", "미국 주식 시장 요즘 어때"), ("시장 지표 조회", "한은 기준금리 지금 몇 프로야"), ("시장 지표 조회", "코스피 오늘 어땠어?"), ("시장 지표 조회", "인플레이션 얼마나 됐어"),
    ("청년미래적금 조회", "청년 적금 정부 지원금 얼마 줘?"), ("청년미래적금 조회", "청년미래적금 가입 조건이 뭐야"), ("청년미래적금 조회", "청년미래적금 한도 얼마까지 넣어?"),
    (None, "금통위 언제 열려?"), (None, "내 적금 만기 알림 받을 수 있어?"), (None, "복리가 뭔지 알려줘"), (None, "예금자 보호 한도가 어떻게 돼요?"), (None, "청년정책 중에 월세 지원 신청 방법 알려줘"), (None, "2026 청년 월세 지원 자격이 어떻게 돼?"),
]


def run(item):
    expected, message = item
    kind, _msg, source, answer, tools, seconds = base.ask_one(("phrasing", message))
    ok = (expected is None) or (expected in tools)
    return expected, message, source, answer, tools, ok


if __name__ == "__main__":
    with ThreadPoolExecutor(max_workers=4) as pool:
        results = list(pool.map(run, QUESTIONS))
    missed = 0
    for expected, message, source, answer, tools, ok in results:
        flag = "OK  " if ok and source != "unavailable" else "MISS"
        missed += flag == "MISS"
        print(f"[{flag}] {message}  expected={expected} tools={tools} source={source}\n      {answer[:200]}")
    print("\nMISSED", missed, "of", len(results))

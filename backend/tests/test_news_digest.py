from datetime import date, datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from app.collectors.naver_news import Headline
from app.core.config import Settings
from app.services.news_digest import (
    DigestError,
    DigestSource,
    build_sources,
    korea_today,
    todays_digest,
    save_digest,
    validate,
    write_digest,
)
from app.services.news_headline_service import NewsHeadlineService

SOURCES = [
    DigestSource("d1", "한은 기준금리 0.25%p 인상", "a.co.kr", "https://a.co.kr/1", "한은 기준금리 0.25%p 인상 — 한국은행이 물가 상승 압력을 이유로 기준금리를 올리기로 결정했다."),
    DigestSource("d2", "저축은행 예금 금리 4%대", "b.co.kr", "https://b.co.kr/1", "저축은행 예금 금리 4%대 — 일부 저축은행이 예금 금리를 높였다."),
    DigestSource("i1", "연준 금리 동결", "Federal Reserve", "https://fed.gov/1", "연준 금리 동결 — 연준이 정책금리를 유지했다."),
]
GOOD = {
    "overview": "오늘은 국내 금리 인상과 해외 금리 동결 소식이 함께 나왔어요.",
    "points": [
        {"text": "한국은행이 기준금리를 0.25%p 올렸어요.", "source_ids": ["d1"]},
        {"text": "일부 저축은행 예금 금리가 4%대로 올라왔어요.", "source_ids": ["d2", "d2"]},
        {"text": "미국 연준은 이번에 금리를 그대로 두었어요.", "source_ids": ["i1"]},
    ],
    "money_notes": [
        {
            "category": "new_savings",
            "text": "한국은행이 기준금리를 0.25%p 올렸어요. 이럴 때는 새로 나오는 예금과 적금 이자도 따라 오르는 경우가 많아요.",
            "source_ids": ["d1"],
        },
    ],
}
NOTE = GOOD["money_notes"][0]


def _settings() -> Settings:
    return Settings(_env_file=None, openai_api_key="test-key")


def test_validate_accepts_grounded_digest() -> None:
    assert validate(GOOD, SOURCES) == []


def test_validate_rejects_unknown_numbers_ids_advice_and_copying() -> None:
    bad = {
        "overview": "금리가 5% 오른 날이에요.",
        "points": [
            {"text": "지금 예금에 가입하세요. 무조건 이득이에요.", "source_ids": ["d9"]},
            {"text": "한국은행이 물가 상승 압력을 이유로 기준금리를 올리기로 결정했대요.", "source_ids": ["d1"]},
            {"text": "연준은 동결했어요.", "source_ids": ["i1"]},
        ],
    }

    errors = validate(bad, SOURCES)

    assert "뉴스 목록에 없는 숫자입니다: 5" in errors
    assert "요약 항목의 근거 뉴스 id가 올바르지 않습니다." in errors
    assert any("무조건" in error for error in errors)
    assert "기사 문장을 그대로 옮긴 부분이 있습니다. 자기 말로 다시 쓰세요." in errors
    assert validate({"overview": "x", "points": []}, SOURCES)[-1] == "요약 항목은 3~5개여야 합니다."


def test_validate_checks_point_numbers_against_cited_sources_only() -> None:
    miscited = {**GOOD, "points": [
        {"text": "한국은행 소식과 함께 예금 금리가 4%대가 됐어요.", "source_ids": ["d1"]},
        *GOOD["points"][1:],
    ]}

    assert validate(miscited, SOURCES) == ["인용한 뉴스에 없는 숫자입니다: 4"]
    assert validate({**GOOD, "overview": "예금 금리 4%대와 기준금리 0.25%p 인상 소식이 있었어요."}, SOURCES) == []


def test_money_notes_may_be_empty_but_never_forecast_advise_or_use_dashes() -> None:
    assert validate({**GOOD, "money_notes": []}, SOURCES) == []

    bad_notes = [
        {**NOTE, "text": "기준금리가 올라서 앞으로 예금 금리가 오를 것으로 보여요. 지금 가입하세요."},
        {**NOTE, "category": "stocks"},
        {**NOTE, "text": "예금 금리가 5%까지 갈 수 있어요.", "source_ids": ["d2"]},
    ]
    errors = validate({**GOOD, "money_notes": bad_notes}, SOURCES)

    assert "내 돈과의 관계 항목에 예측이나 권유 표현이 있습니다: 것으로 보" in errors
    assert "내 돈과의 관계 항목에서 무엇을 하라고 권하지 마세요." in errors
    assert "내 돈과의 관계 항목의 분류가 올바르지 않습니다." in errors
    assert "인용한 뉴스에 없는 숫자입니다: 5" in errors
    assert validate({**GOOD, "money_notes": [NOTE] * 4}, SOURCES) == ["내 돈과의 관계 항목은 0~3개여야 합니다."]
    assert validate({**GOOD, "money_notes": [{**NOTE, "source_ids": ["x9"]}]}, SOURCES) == [
        "내 돈과의 관계 항목의 근거 뉴스 id가 올바르지 않습니다.",
    ]
    assert validate({**GOOD, "overview": "오늘은 금리 소식 — 국내와 해외가 엇갈렸어요."}, SOURCES) == ["줄표(—, –)를 쓰지 마세요."]


@pytest.mark.parametrize("text, error", [
    ("금리가 오를 가능성이 커요.", "내 돈과의 관계 항목에 예측이나 권유 표현이 있습니다: 가능성"),
    ("이자 부담이 커지겠어요.", "내 돈과의 관계 항목에 예측이나 권유 표현이 있습니다: 겠"),
    ("새 적금 가입을 고려해 볼 만해요.", "내 돈과의 관계 항목에 예측이나 권유 표현이 있습니다: 고려"),
    ("지금은 해지하지 마세요.", "내 돈과의 관계 항목에서 무엇을 하라고 권하지 마세요."),
    ("납입을 유지하세요.", "내 돈과의 관계 항목에서 무엇을 하라고 권하지 마세요."),
    ("국민은행 예금 이자가 올랐어요.", "내 돈과의 관계 항목에 금융회사 이름을 쓰지 마세요: 국민은행"),
])
def test_money_notes_reject_reworded_forecasts_advice_and_company_names(text: str, error: str) -> None:
    assert error in validate({**GOOD, "money_notes": [{**NOTE, "text": text}]}, SOURCES)


def test_money_notes_allow_generic_bank_names_a_check_request_and_reject_duplicates() -> None:
    allowed = "한국은행과 시중은행, 저축은행 소식이에요. 내 상품 조건은 가입한 곳에서 확인해 보세요."
    assert validate({**GOOD, "money_notes": [{**NOTE, "text": allowed}]}, SOURCES) == []
    assert validate({**GOOD, "money_notes": [NOTE, NOTE]}, SOURCES) == ["내 돈과의 관계 항목이 중복됐습니다."]


def test_write_digest_retries_once_and_links_come_from_sources() -> None:
    calls: list[list[str]] = []

    def ask(settings, sources, feedback):
        calls.append(feedback)
        return ({"overview": "금리 7% 시대", "points": GOOD["points"]} if not feedback else GOOD), "test-model"

    digest = write_digest(_settings(), SOURCES, ask)

    assert len(calls) == 2 and calls[1]
    assert digest.model == "test-model"
    assert digest.points[1]["sources"] == [{"title": "저축은행 예금 금리 4%대", "publisher": "b.co.kr", "url": "https://b.co.kr/1"}]
    assert digest.money_notes == [{
        "category": "new_savings", "text": NOTE["text"],
        "sources": [{"title": "한은 기준금리 0.25%p 인상", "publisher": "a.co.kr", "url": "https://a.co.kr/1"}],
    }]


def test_write_digest_fails_after_two_bad_answers_or_too_few_sources() -> None:
    with pytest.raises(DigestError):
        write_digest(_settings(), SOURCES, lambda *_: ({"overview": "", "points": []}, "m"))
    with pytest.raises(DigestError):
        write_digest(_settings(), SOURCES[:2], lambda *_: (GOOD, "m"))


def test_build_sources_uses_featured_headlines_and_memory_snippets(client: TestClient) -> None:
    now = datetime.now(timezone.utc)
    with client.app.state.session_factory() as session:
        NewsHeadlineService(session).save("naver", "domestic", "적금", [
            Headline("청년미래적금 가입 안내", "a.co.kr", "https://a.co.kr/1", now - timedelta(hours=1)),
            Headline("기준금리 동결 결정", "b.co.kr", "https://b.co.kr/1", now - timedelta(hours=2)),
        ], now)
        sources = build_sources(session, {"https://a.co.kr/1": "가입 조건이 공개됐다."}, now)

    assert [source.id for source in sources] == ["d1", "d2"]
    assert sources[0].text == "청년미래적금 가입 안내 | 가입 조건이 공개됐다."
    assert sources[1].text == "기준금리 동결 결정"


def test_digest_endpoint_shows_only_todays_digest(client: TestClient) -> None:
    today = korea_today()
    digest = write_digest(_settings(), SOURCES, lambda *_: (GOOD, "test-model"))
    with client.app.state.session_factory() as session:
        save_digest(session, digest, today - timedelta(days=1))

    assert client.get("/api/v1/daily/digest").status_code == 404  # yesterday's digest is not shown as today's

    with client.app.state.session_factory() as session:
        save_digest(session, digest, today)
        save_digest(session, digest, today)  # re-running the same day replaces the row
        assert todays_digest(session, date(2000, 1, 1)) is None

    body = client.get("/api/v1/daily/digest").json()

    assert body["digestDate"] == today.isoformat()
    assert body["overview"] == GOOD["overview"]
    assert body["points"][0]["sources"][0]["url"] == "https://a.co.kr/1"
    assert body["moneyNotes"][0]["category"] == "new_savings"
    assert body["moneyNotes"][0]["sources"][0]["url"] == "https://a.co.kr/1"
    assert body["aiModel"] == "test-model"


def test_digest_written_before_money_notes_returns_null_notes(client: TestClient) -> None:
    digest = write_digest(_settings(), SOURCES, lambda *_: (GOOD, "test-model"))
    with client.app.state.session_factory() as session:
        row = save_digest(session, digest, korea_today())
        row.money_notes = None
        session.commit()

    assert client.get("/api/v1/daily/digest").json()["moneyNotes"] is None

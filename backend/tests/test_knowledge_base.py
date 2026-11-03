import hashlib
import math
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.daily_briefing import FinancialTerm, NewsDigest
from app.models.knowledge import KnowledgeChunk
from app.services.knowledge_base import build_documents, mentioned_day, retrieve, sync
from app.services.market_service import MarketService
from app.services.openai_client import EMBEDDING_DIMENSIONS, OpenAIError

URL = "/api/v1/assistant/chat"
TODAY = date(2026, 11, 2)


class FakeEmbed:
    """Character-bigram vectors: texts sharing words end up close, like a real embedding would."""

    def __init__(self) -> None:
        self.calls: list[list[str]] = []

    def __call__(self, texts: list[str]) -> list[list[float]]:
        self.calls.append(list(texts))
        vectors = []
        for text in texts:
            vector = [0.0] * EMBEDDING_DIMENSIONS
            compact = "".join(text.split())
            for start in range(len(compact) - 1):
                bucket = int(hashlib.md5(compact[start:start + 2].encode()).hexdigest(), 16) % EMBEDDING_DIMENSIONS
                vector[bucket] += 1.0
            norm = math.sqrt(sum(value * value for value in vector)) or 1.0
            vectors.append([value / norm for value in vector])
        return vectors


def _term(session, slug: str, name: str, example: str, reviewed: bool = True) -> None:
    session.add(FinancialTerm(
        slug=slug, name=name, short_definition="공식 정의", example=example,
        source_name="s", source_url="https://e.kr", is_reviewed=reviewed,
    ))


def _digest(session, day: date, overview: str, point: str, note: str | None = None) -> None:
    session.add(NewsDigest(
        digest_date=day, overview=overview, ai_model="m", created_at=datetime.now(timezone.utc),
        points=[{"text": point, "sources": [{"title": f"{day} 기사", "publisher": "a.co.kr", "url": f"https://a.co.kr/{day}"}]}],
        money_notes=[{"category": "loan", "text": note, "sources": [{"title": "t", "publisher": "a.co.kr", "url": "https://a.co.kr/n"}]}]
        if note else None,
    ))


def _seed(session) -> None:
    _term(session, "base-rate", "기준금리", "한국은행이 정하는 금리의 기준점이에요.")
    _term(session, "exchange-rate", "환율", "우리 돈을 다른 나라 돈으로 바꿀 때의 값이에요.")
    _term(session, "hidden", "비공개", "아직 공개하지 않은 설명", reviewed=False)
    _digest(session, TODAY, "오늘은 가계대출 금리가 올랐어요.", "가계대출 금리가 5%에 가까워졌어요.", "대출 금리가 오르면 이자 부담이 커질 수 있어요.")
    _digest(session, TODAY - timedelta(days=1), "어제는 환율이 크게 움직였어요.", "원달러 환율이 올랐어요.")
    MarketService(session).save("usd_krw", [("20261030", Decimal("1337.2")), ("20261029", Decimal("1330"))])
    session.commit()


def test_documents_cover_guide_published_terms_digests_notes_and_market(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        _seed(session)
        documents = {document.key: document for document in build_documents(session)}

    assert {"guide:intro", "guide:/cashflow", "guide:/auth", "guide:/market", "guide:calculation"} <= set(documents)
    assert "term:base-rate" in documents and "term:hidden" not in documents
    note = documents["money_note:2026-11-02:1"]
    assert note.published_on == TODAY and "빌린 돈(대출)" in note.title and note.url == "https://a.co.kr/n"
    assert documents["digest:2026-11-02:p1"].content.startswith("2026년 11월 2일 경제 뉴스:")
    assert documents["digest:2026-11-01:overview"].url == "/daily"
    market = documents["market:usd_krw"]
    assert "2026년 10월 30일 기준 1337.2원" in market.content and "+7.2원" in market.content
    assert not [key for key in documents if key.startswith("money_note:2026-11-01")]


def test_sync_embeds_only_new_or_changed_text_and_removes_stale_chunks(client: TestClient) -> None:
    embed = FakeEmbed()
    with client.app.state.session_factory() as session:
        _seed(session)
        first = sync(session, embed)
        assert first.embedded == first.total and first.removed == 0
        assert sync(session, embed).embedded == 0

        term = session.scalar(select(FinancialTerm).where(FinancialTerm.slug == "base-rate"))
        term.example = "바뀐 설명이에요."
        session.scalar(select(FinancialTerm).where(FinancialTerm.slug == "exchange-rate")).is_reviewed = False
        session.commit()
        third = sync(session, embed)

        assert (third.embedded, third.removed) == (1, 1)
        assert embed.calls[-1] == ["금융용어 기준금리\n기준금리: 바뀐 설명이에요."]
        assert session.scalar(select(KnowledgeChunk).where(KnowledgeChunk.source_key == "term:exchange-rate")) is None


def test_retrieve_is_empty_without_knowledge_and_finds_the_closest_chunk(client: TestClient) -> None:
    embed = FakeEmbed()
    with client.app.state.session_factory() as session:
        assert retrieve(session, "기준금리가 뭐야?", embed, TODAY) == []
        assert embed.calls == []  # an empty knowledge base never costs an embedding call
        _seed(session)
        sync(session, embed)

        found = retrieve(session, "한국은행이 정하는 기준금리가 뭐야?", embed, TODAY)

    assert found[0].chunk.source_key == "term:base-rate"
    assert len(found) == 5


def test_a_named_day_lifts_that_days_news_above_closer_wording(client: TestClient) -> None:
    embed = FakeEmbed()
    with client.app.state.session_factory() as session:
        _seed(session)
        sync(session, embed, datetime(2026, 11, 2, 3, tzinfo=timezone.utc))
        question = "어제 가계대출 금리 소식 알려줘"

        news = lambda found: [item for item in found if item.chunk.source_type == "digest"]  # noqa: E731
        plain = news(retrieve(session, question, embed, TODAY, day_aware=False))
        aware = news(retrieve(session, question, embed, TODAY))

    assert plain[0].chunk.published_on == TODAY  # wording alone prefers today's loan story
    assert aware[0].chunk.published_on == TODAY - timedelta(days=1)


def test_asking_when_next_puts_the_nearest_upcoming_meeting_first(client: TestClient) -> None:
    embed = FakeEmbed()
    with client.app.state.session_factory() as session:
        sync(session, embed, datetime(2026, 11, 2, 3, tzinfo=timezone.utc))
        found = retrieve(session, "다음 미국 연준 FOMC 정례회의 언제야?", embed, TODAY)
        events = [item.chunk.published_on for item in found if item.chunk.source_type == "event"]

    assert events[0] == date(2026, 12, 9)  # the nearest meeting, not a 2027 one with the same wording


def test_upcoming_events_are_searchable_and_drop_off_once_past(client: TestClient) -> None:
    embed = FakeEmbed()
    with client.app.state.session_factory() as session:
        documents = {document.key: document for document in build_documents(session, TODAY)}
        later = {document.key for document in build_documents(session, date(2026, 11, 27))}

    bok = documents["event:bok-2026-11-26"]
    assert bok.content.startswith("2026년 11월 26일(목) 한국은행 금융통화위원회(금통위) 기준금리 결정.")
    assert bok.url.startswith("https://www.bok.or.kr/") and bok.published_on == date(2026, 11, 26)
    assert "잠정" in documents["event:fomc-2027-01-27"].content
    assert "event:bok-2026-11-26" not in later and "event:fomc-2026-12-09" in later
    assert embed.calls == []


@pytest.mark.parametrize("question, expected", [
    ("오늘 뉴스 알려줘", TODAY),
    ("어제 무슨 일 있었어?", date(2026, 11, 1)),
    ("그저께 환율", date(2026, 10, 31)),
    ("10월 30일 금리", date(2026, 10, 30)),
    ("11월 26일 금통위 일정 알려줘", date(2026, 11, 26)),
    ("12월 25일 소식", date(2026, 12, 25)),
    ("5월 1일 뉴스", date(2026, 5, 1)),
    ("2월 30일", None),
    ("기준금리가 뭐야?", None),
])
def test_mentioned_day(question: str, expected: date | None) -> None:
    assert mentioned_day(question, TODAY) == expected


def test_mentioned_day_reads_a_late_december_day_in_january_as_last_year() -> None:
    assert mentioned_day("12월 30일 뉴스", date(2027, 1, 5)) == date(2026, 12, 30)


def test_mentioned_day_finds_the_latest_leap_day() -> None:
    assert mentioned_day("2월 29일 뉴스", date(2027, 3, 1)) == date(2024, 2, 29)
    assert mentioned_day("2월 29일 뉴스", date(2028, 1, 10)) == date(2028, 2, 29)  # soon ahead
    assert mentioned_day("2월 29일 뉴스", date(2028, 3, 1)) == date(2028, 2, 29)


def test_assistant_answers_from_retrieved_chunks_and_shows_only_cited_ones(client: TestClient) -> None:
    embed = FakeEmbed()
    seen: list[str] = []

    def ask(settings, context, message, feedback):
        seen.append(context)
        return {"answer": "기준금리는 한국은행이 정하는 금리의 기준점이에요.", "link_paths": ["/market"], "source_ids": ["K1", "K9", "K1"]}

    client.app.state.knowledge_embed = embed
    client.app.state.assistant_ask = ask
    with client.app.state.session_factory() as session:
        _seed(session)
        sync(session, embed)

    body = client.post(URL, json={"message": "한국은행이 정하는 기준금리가 뭐야?"}).json()

    assert seen[0].count("[K") == 5 and "[K1] 금융용어 기준금리" in seen[0]
    assert "화면 안내:" not in seen[0]  # the fixed guide is not sent whole any more
    assert body["sources"] == [{"title": "금융용어 기준금리", "url": None, "publishedOn": None}]
    assert body["links"] == [{"to": "/market", "label": "시장 지표"}]


def test_rag_answers_must_cite_and_take_numbers_from_the_cited_chunks() -> None:
    from app.services.assistant_chat import AnswerSource, answer_question
    from app.core.config import Settings

    sources = {
        "K1": AnswerSource("시장 지표 원/달러", "/market", None, "원/달러: 2026년 10월 30일 기준 1337.2원."),
        "K2": AnswerSource("2026년 11월 2일 경제 뉴스 요약", "/daily", TODAY, "2026년 11월 2일 경제 뉴스 한 줄 요약"),
    }
    context = "참고 자료 " + " ".join(source.content for source in sources.values())
    answers = iter([
        {"answer": "원/달러 환율은 2026년 11월 2일 기준 1337.2원이에요.", "link_paths": [], "source_ids": ["K1"]},
        {"answer": "원/달러 환율은 2026년 10월 30일 기준 1337.2원이에요.", "link_paths": [], "source_ids": []},
        {"answer": "원/달러 환율은 2026년 10월 30일 기준 1337.2원이에요.", "link_paths": [], "source_ids": ["K1"]},
    ])
    feedbacks: list[list[str]] = []

    def ask(settings, ctx, message, feedback):
        feedbacks.append(list(feedback))
        return next(answers)

    first = answer_question(Settings(_env_file=None), "환율 얼마야?", context, ask, sources)
    assert first.source == "rule"  # wrong date from the other chunk, then no citation: both rejected
    assert feedbacks[1] == ["인용한 참고 자료에 없는 숫자입니다: 11", "인용한 참고 자료에 없는 숫자입니다: 2"]

    second = answer_question(Settings(_env_file=None), "환율 얼마야?", context, ask, sources)
    assert second.source == "ai" and [source.title for source in second.sources] == ["시장 지표 원/달러"]

    unknown = answer_question(
        Settings(_env_file=None), "비트코인 시세는?", context,
        lambda *_: {"answer": "그건 제가 가진 자료로는 알 수 없어요.", "link_paths": [], "source_ids": []}, sources,
    )
    assert unknown.source == "ai" and unknown.sources == []

    hedged = answer_question(
        Settings(_env_file=None), "환율 얼마야?", context,
        lambda *_: {"answer": "잘 모르겠지만 1337.2원이에요.", "link_paths": [], "source_ids": []}, sources,
    )
    assert hedged.source == "rule"  # "모르" with a number still needs a source


GOOD_VECTOR = [0.1] * EMBEDDING_DIMENSIONS


@pytest.mark.parametrize("payload", [
    [],
    {"data": "x"},
    {"data": [{"index": 0}]},
    {"data": [{"index": 0, "embedding": ["a"]}]},
    {"data": [{"index": 0, "embedding": GOOD_VECTOR}, {"index": 0, "embedding": GOOD_VECTOR}]},
    {"data": [{"index": 0, "embedding": GOOD_VECTOR}, {"index": 2, "embedding": GOOD_VECTOR}]},
    {"data": [{"index": 0, "embedding": GOOD_VECTOR}, {"index": 1, "embedding": [*GOOD_VECTOR[:-1], "NaN"]}]},
    {"data": [{"index": 0, "embedding": GOOD_VECTOR}, {"index": 1, "embedding": GOOD_VECTOR[:-1]}]},
])
def test_malformed_embedding_responses_become_openai_errors(monkeypatch: pytest.MonkeyPatch, payload: object) -> None:
    from app.core.config import Settings
    from app.services import openai_client

    monkeypatch.setattr(openai_client, "_post", lambda *_: payload)
    with pytest.raises(OpenAIError):
        openai_client.embed_texts(Settings(_env_file=None, openai_api_key="test-key"), ["질문", "두 번째"])


def test_embedding_vectors_come_back_in_input_order(monkeypatch: pytest.MonkeyPatch) -> None:
    from app.core.config import Settings
    from app.services import openai_client

    second = [0.2] * EMBEDDING_DIMENSIONS
    monkeypatch.setattr(openai_client, "_post", lambda *_: {"data": [
        {"index": 1, "embedding": second}, {"index": 0, "embedding": GOOD_VECTOR},
    ]})
    vectors = openai_client.embed_texts(Settings(_env_file=None, openai_api_key="test-key"), ["질문", "두 번째"])
    assert vectors == [GOOD_VECTOR, second]


def test_failed_knowledge_refresh_makes_the_job_partial_and_keeps_collected_data(
    client: TestClient, monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.config import Settings
    from app.models.market import MarketPoint
    from app.services import daily_jobs

    def broken_sync(session, embed):
        raise OpenAIError("OpenAI에 연결하지 못했습니다.")

    monkeypatch.setattr(daily_jobs, "sync_knowledge", broken_sync)
    settings = Settings(_env_file=None, ecos_api_key="test-key", openai_api_key="test-key")
    with client.app.state.session_factory() as session:
        result = daily_jobs.run_market_job(settings, session, lambda *_: [("20261030", Decimal("1"))])
        saved = session.scalars(select(MarketPoint)).all()

    assert result.status == "partial"
    assert result.failures == ["도우미 자료: OpenAI에 연결하지 못했습니다."]
    assert len(saved) == len(daily_jobs.SERIES)


def test_assistant_falls_back_to_the_fixed_guide_when_search_fails(client: TestClient) -> None:
    seen: list[str] = []

    def broken_embed(texts):
        raise OpenAIError("OpenAI에 연결하지 못했습니다.")

    def ask(settings, context, message, feedback):
        seen.append(context)
        return {"answer": "월별 납입 계획에서 확인해요.", "link_paths": ["/cashflow"], "source_ids": ["K1"]}

    client.app.state.knowledge_embed = broken_embed
    client.app.state.assistant_ask = ask
    with client.app.state.session_factory() as session:
        _seed(session)
        sync(session, FakeEmbed())

    body = client.post(URL, json={"message": "납입을 빠뜨리면 어떻게 돼요?"}).json()

    assert "화면 안내:" in seen[0]
    assert body["sources"] == []
    assert body["answer"] == "월별 납입 계획에서 확인해요."


def test_answers_are_plain_text_without_markdown_links() -> None:
    from app.services.assistant_chat import plain_text

    assert plain_text("  [만기 후 계획](/maturity)에서 **성향**을 고르세요 ") == "만기 후 계획에서 성향을 고르세요"
    assert plain_text("링크 없음") == "링크 없음"

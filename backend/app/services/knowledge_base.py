"""Knowledge base for 머니독: what it may answer from, embedded once and searched per question.

Only text we wrote or may publish goes in: the site guide, published easy term explanations, the AI news
digests and money notes we already show, Bank of Korea ECOS market values and upcoming official dates. Article bodies, the Naver
snippet and Bank of Korea press release text are never stored here.

Search: pgvector cosine distance on PostgreSQL, the same cosine in Python elsewhere (tests). When the question
names a day ("오늘", "어제", "11월 2일"), chunks from that day get a boost and are always considered.
"""

from __future__ import annotations

import hashlib
import math
import re
from collections.abc import Callable
from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import delete, func, select, text
from sqlalchemy.orm import Session

from app.models.daily_briefing import FinancialTerm, NewsDigest
from app.models.knowledge import KnowledgeChunk
from app.services.events import EVENTS
from app.services.market_service import MarketService
from app.services.news_digest import korea_today
from app.services.openai_client import EMBEDDING_MODEL
from app.services.site_guide import GUIDE

Embed = Callable[[list[str]], list[list[float]]]

SEARCH_LIMIT = 5
CANDIDATES = 20
SAME_DAY_BOOST = 0.15
OTHER_DAY_PENALTY = 0.05
SOON_BOOST = 0.1  # "다음 금통위 언제야?": among upcoming dates, the nearer the better
SOON_DAYS = 120
SOON_WORDS = ("다음", "언제", "예정", "앞으로", "곧")
# Hybrid search: a small bonus for how many of the question's two-letter pieces appear in the chunk, so exact
# words ("안정형", "금통위") the embedding underweights still count. Particles make whole words unreliable in Korean.
LEXICAL_WEIGHT = 0.1
WORD_PATTERN = re.compile(r"[가-힣A-Za-z0-9]+")
DATED_TYPES = {"digest", "money_note", "event"}
WEEKDAYS = "월화수목금토일"
MONEY_NOTE_LABELS = {
    "new_savings": "새로 드는 예금·적금",
    "current_savings": "이미 넣고 있는 적금",
    "loan": "빌린 돈(대출)",
    "fx": "환율·해외 결제",
}
PAGE_PATTERN = re.compile(r"^- (.+?)\((/[a-z-]+)\)(?:, [^:]+)?: (.+)$")
DAY_PATTERN = re.compile(r"(\d{1,2})\s*월\s*(\d{1,2})\s*일")


@dataclass(frozen=True)
class Document:
    key: str
    kind: str
    title: str
    content: str
    url: str | None = None
    published_on: date | None = None

    @property
    def embed_text(self) -> str:
        return f"{self.title}\n{self.content}"

    @property
    def sha256(self) -> str:
        return hashlib.sha256(self.embed_text.encode("utf-8")).hexdigest()


@dataclass(frozen=True)
class Retrieved:
    chunk: KnowledgeChunk
    score: float


@dataclass(frozen=True)
class SyncResult:
    total: int
    embedded: int
    removed: int


def _korean_date(day: date) -> str:
    return f"{day.year}년 {day.month}월 {day.day}일"


def _number(value: Decimal) -> str:
    text_value = format(value.normalize(), "f")
    return text_value if "." in text_value else f"{int(value):,}"


def _guide_documents() -> list[Document]:
    documents = []
    lines = [line for line in GUIDE.splitlines() if line.strip()]
    documents.append(Document("guide:intro", "guide", "Very Rich? 서비스 소개", lines[0]))
    for line in lines[1:]:
        if match := PAGE_PATTERN.match(line):
            name, path, body = match.groups()
            documents.append(Document(f"guide:{path}", "guide", f"{name} 화면 안내", f"{name}({path}): {body}", path))
        elif line.startswith("계산 방식"):
            documents.append(Document("guide:calculation", "guide", "계산 방식", line, "/about"))
    return documents


def _term_documents(session: Session) -> list[Document]:
    terms = session.scalars(select(FinancialTerm).where(FinancialTerm.is_reviewed.is_(True)).order_by(FinancialTerm.id))
    return [
        Document(f"term:{term.slug}", "term", f"금융용어 {term.name}", f"{term.name}: {term.example.strip()}")
        for term in terms if term.example.strip()
    ]


def _digest_documents(session: Session) -> list[Document]:
    documents = []
    for row in session.scalars(select(NewsDigest).order_by(NewsDigest.digest_date)):
        day = row.digest_date
        label = _korean_date(day)
        documents.append(Document(
            f"digest:{day.isoformat()}:overview", "digest", f"{label} 경제 뉴스 요약", f"{label} 경제 뉴스 한 줄 요약: {row.overview}",
            "/daily", day,
        ))
        for index, point in enumerate(row.points or [], 1):
            sources = point.get("sources") or [{}]
            documents.append(Document(
                f"digest:{day.isoformat()}:p{index}", "digest", sources[0].get("title") or f"{label} 경제 뉴스",
                f"{label} 경제 뉴스: {point.get('text', '')}", sources[0].get("url"), day,
            ))
        for index, note in enumerate(row.money_notes or [], 1):
            sources = note.get("sources") or [{}]
            category = MONEY_NOTE_LABELS.get(str(note.get("category")), "내 돈")
            documents.append(Document(
                f"money_note:{day.isoformat()}:{index}", "money_note", f"{label} 오늘 소식과 내 돈({category})",
                f"{label} 오늘 소식과 내 돈({category}): {note.get('text', '')}", sources[0].get("url"), day,
            ))
    return documents


def _market_documents(session: Session) -> list[Document]:
    snapshot = MarketService(session).snapshot()
    documents = []
    for group in snapshot.groups:
        for item in group.items:
            period = item.period
            when = (
                _korean_date(date(int(period[:4]), int(period[4:6]), int(period[6:8])))
                if len(period) == 8 else f"{period[:4]}년 {int(period[4:6])}월"
            )
            name = f"{item.name} 주가지수" if group.key == "world_stock" else item.name
            index_based = "=" in item.unit  # e.g. "2015=100": an index level, not a price
            unit = "" if index_based else item.unit
            body = f"{name}: {when} 기준 {_number(item.value)}{unit}."
            if item.change is not None and item.previous_period:
                sign = "+" if item.change > 0 else ""
                change_unit = "%p" if unit == "%" else unit  # a rate moves in percentage points
                body += f" 바로 전 값보다 {sign}{_number(item.change)}{change_unit}"
                if item.change_percent is not None:
                    body += f"({sign}{_number(item.change_percent)}%)"
                body += " 달라졌어요."
            if item.code == "cpi_yoy":
                # Plain wording so "요즘 물가 얼마나 올랐어?" finds the figure, not only the release dates.
                direction = "올랐" if item.value >= 0 else "내렸"
                body += f" 요즘 물가는 1년 전 같은 달보다 {_number(abs(item.value))}% {direction}다는 뜻이에요."
            body += f" {group.title} 지표, 한국은행 경제통계시스템(ECOS) 공식 통계. {group.note}"
            documents.append(Document(f"market:{item.code}", "market", f"시장 지표 {name}", body, "/market"))
    return documents


def _event_documents(today: date) -> list[Document]:
    # Only dates still ahead; the daily refresh drops each one after it passes.
    documents = []
    for event in EVENTS:
        if event.day < today:
            continue
        when = f"{_korean_date(event.day)}({WEEKDAYS[event.day.weekday()]})"
        note = " 날짜는 잠정이며 직전 회의에서 확정돼요." if event.tentative else ""
        documents.append(Document(
            f"event:{event.key}", "event", f"다가올 일정 {event.title}",
            f"{when} {event.title}. {event.why}{note} 출처: {event.source_name}.", event.source_url, event.day,
        ))
    return documents


def build_documents(session: Session, today: date | None = None) -> list[Document]:
    return [
        *_guide_documents(), *_term_documents(session), *_digest_documents(session), *_market_documents(session),
        *_event_documents(today or korea_today()),
    ]


def sync(session: Session, embed: Embed, now: datetime | None = None) -> SyncResult:
    """Make the table match build_documents(); only new or changed text is sent for embedding."""
    now = now or datetime.now(timezone.utc)
    documents = build_documents(session, korea_today(now))
    existing = {chunk.source_key: chunk for chunk in session.scalars(select(KnowledgeChunk))}
    stale = [
        document for document in documents
        if (chunk := existing.get(document.key)) is None
        or chunk.content_sha256 != document.sha256 or chunk.embedding is None or chunk.embedding_model != EMBEDDING_MODEL
    ]
    vectors = embed([document.embed_text for document in stale]) if stale else []
    if len(vectors) != len(stale):
        raise ValueError("임베딩 개수가 자료 개수와 다릅니다.")
    vector_by_key = {document.key: vector for document, vector in zip(stale, vectors)}
    for document in documents:
        chunk = existing.get(document.key)
        if chunk is None:
            chunk = KnowledgeChunk(source_key=document.key)
            session.add(chunk)
        chunk.source_type = document.kind
        chunk.title = document.title[:300]
        chunk.content = document.content
        chunk.url = document.url
        chunk.published_on = document.published_on
        if document.key in vector_by_key:
            chunk.content_sha256 = document.sha256
            chunk.embedding = vector_by_key[document.key]
            chunk.embedding_model = EMBEDDING_MODEL
            chunk.updated_at = now
    keep = {document.key for document in documents}
    removed = [key for key in existing if key not in keep]
    if removed:
        session.execute(delete(KnowledgeChunk).where(KnowledgeChunk.source_key.in_(removed)))
    session.commit()
    return SyncResult(len(documents), len(stale), len(removed))


def mentioned_day(question: str, today: date) -> date | None:
    if "그저께" in question or "그제" in question:
        return today - timedelta(days=2)
    if "어제" in question:
        return today - timedelta(days=1)
    if match := DAY_PATTERN.search(question):
        # A day soon ahead is an upcoming date ("11월 26일 금통위"); anything else is the latest past one (news).
        month, day = int(match.group(1)), int(match.group(2))
        candidates = []
        # Eight years back always reaches a leap year, so "2월 29일" still finds its latest past day.
        for year in range(today.year - 8, today.year + 2):
            try:
                candidates.append(date(year, month, day))
            except ValueError:
                continue
        soon = [found for found in candidates if 0 <= (found - today).days <= SOON_DAYS]
        past = [found for found in candidates if found <= today]
        return soon[0] if soon else max(past, default=None)
    if "오늘" in question:
        return today
    return None


def _cosine(left: list[float], right: list[float]) -> float:
    dot = sum(a * b for a, b in zip(left, right))
    norm = math.sqrt(sum(a * a for a in left)) * math.sqrt(sum(b * b for b in right))
    return dot / norm if norm else 0.0


def _nearest(session: Session, vector: list[float], limit: int) -> list[Retrieved]:
    base = select(KnowledgeChunk).where(KnowledgeChunk.embedding_model == EMBEDDING_MODEL)
    if session.get_bind().dialect.name == "postgresql":
        literal = "[" + ",".join(repr(value) for value in vector) + "]"
        rows = session.execute(text(
            "SELECT id, 1 - (embedding <=> CAST(:vector AS vector)) AS score FROM knowledge_chunks "
            "WHERE embedding IS NOT NULL AND embedding_model = :model "
            "ORDER BY embedding <=> CAST(:vector AS vector) LIMIT :limit"
        ), {"vector": literal, "model": EMBEDDING_MODEL, "limit": limit}).all()
        chunks = {chunk.id: chunk for chunk in session.scalars(base.where(KnowledgeChunk.id.in_([row.id for row in rows])))}
        return [Retrieved(chunks[row.id], float(row.score)) for row in rows if row.id in chunks]
    scored = [Retrieved(chunk, _cosine(vector, chunk.embedding)) for chunk in session.scalars(base) if chunk.embedding]
    return sorted(scored, key=lambda item: item.score, reverse=True)[:limit]


def _bigrams(text: str) -> set[str]:
    return {word[i:i + 2] for word in WORD_PATTERN.findall(text) for i in range(len(word) - 1)}


def retrieve(
    session: Session, question: str, embed: Embed, today: date, limit: int = SEARCH_LIMIT, day_aware: bool = True,
    lexical: bool = True,
) -> list[Retrieved]:
    """Best chunks for the question, or [] when the knowledge base is empty (the caller then falls back).

    day_aware=False is plain vector search; the evaluation script compares the two.
    """
    if not session.scalar(select(func.count()).select_from(KnowledgeChunk).where(KnowledgeChunk.embedding_model == EMBEDDING_MODEL)):
        return []
    vector = embed([question])[0]
    candidates = {item.chunk.id: item for item in _nearest(session, vector, CANDIDATES)}
    day = mentioned_day(question, today) if day_aware else None
    if day is not None:
        # The day's own chunks are few; always consider them even if the vector search missed them.
        for chunk in session.scalars(select(KnowledgeChunk).where(KnowledgeChunk.published_on == day)):
            if chunk.id not in candidates and chunk.embedding:
                candidates[chunk.id] = Retrieved(chunk, _cosine(vector, chunk.embedding))
    asks_soon = day_aware and any(word in question for word in SOON_WORDS)
    pieces = _bigrams(question) if lexical else set()
    ranked = []
    for item in candidates.values():
        score = item.score
        if pieces:
            text = f"{item.chunk.title} {item.chunk.content}"
            score += LEXICAL_WEIGHT * sum(1 for piece in pieces if piece in text) / len(pieces)
        if day is not None and item.chunk.source_type in DATED_TYPES:
            score += SAME_DAY_BOOST if item.chunk.published_on == day else -OTHER_DAY_PENALTY
        if asks_soon and item.chunk.source_type == "event" and item.chunk.published_on is not None:
            ahead = (item.chunk.published_on - today).days
            if ahead >= 0:
                score += SOON_BOOST * max(0.0, 1 - ahead / SOON_DAYS)
        ranked.append(Retrieved(item.chunk, score))
    return sorted(ranked, key=lambda item: item.score, reverse=True)[:limit]

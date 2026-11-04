import logging
from datetime import date

from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import Field
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.daily_briefing import CamelModel
from app.services.assistant_chat import (
    RECOMMEND_PATTERN,
    small_talk,
    AnswerSource,
    AssistantReply,
    _call,
    add_history,
    add_tool_results,
    answer_question,
    build_context,
    build_rag_context,
)
from app.services.assistant_tools import FOLLOW_UP_LENGTH, run_tools
from app.services.knowledge_base import retrieve
from app.services.news_digest import korea_today
from app.services.openai_client import OpenAIError, embed_texts

logger = logging.getLogger(__name__)

router = APIRouter()


class HistoryItem(CamelModel):
    role: Literal["user", "assistant"]
    text: str = Field(max_length=300)


class AssistantChatRequest(CamelModel):
    message: str = Field(min_length=1, max_length=200)
    history: list[HistoryItem] = Field(default_factory=list, max_length=6)  # earlier turns of this visit, kept only in the browser


class AssistantLinkResponse(CamelModel):
    to: str
    label: str


class AssistantSourceResponse(CamelModel):
    title: str
    url: str | None = None
    published_on: date | None = None


class AssistantChatResponse(CamelModel):
    answer: str
    links: list[AssistantLinkResponse]
    source: str
    sources: list[AssistantSourceResponse] = []
    suggestions: list[str] = []


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _response(reply: AssistantReply) -> AssistantChatResponse:
    return AssistantChatResponse(
        answer=reply.answer,
        links=[AssistantLinkResponse(to=path, label=label) for path, label in reply.links],
        source=reply.source,
        sources=[AssistantSourceResponse(title=item.title, url=item.url, published_on=item.published_on) for item in reply.sources],
        suggestions=reply.suggestions,
    )


@router.post("/assistant/chat", response_model=AssistantChatResponse)
def chat_with_assistant(payload: AssistantChatRequest, request: Request) -> AssistantChatResponse:
    settings = request.app.state.settings
    ask = getattr(request.app.state, "assistant_ask", _call)
    # Recommendation questions are answered by a fixed rule and never reach the model or the rate limit.
    if small_talk(payload.message) is not None or RECOMMEND_PATTERN.search(" ".join(payload.message.split())):
        return _response(answer_question(settings, payload.message, "", ask))
    if not settings.openai_api_key and not hasattr(request.app.state, "assistant_ask"):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="도우미 답변 기능이 설정되지 않았습니다.")
    if not request.app.state.assistant_limiter.allow(_client_key(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="질문이 너무 많아요. 잠시 후 다시 물어봐 주세요.",
        )
    embed = getattr(request.app.state, "knowledge_embed", None) or (lambda texts: embed_texts(settings, texts))
    sources: dict[str, AnswerSource] = {}
    turns = [(item.role, item.text) for item in payload.history]
    earlier_questions = [text for role, text in turns if role == "user"]
    # A short follow-up ("그럼 서울은?") is searched together with the question before it.
    query = payload.message
    if earlier_questions and len(" ".join(query.split())) <= FOLLOW_UP_LENGTH:
        query = f"{earlier_questions[-1]} {payload.message}"
    try:
        with request.app.state.session_factory() as session:
            try:
                retrieved = retrieve(session, query, embed, korea_today())
            except (OpenAIError, SQLAlchemyError, ValueError) as error:
                # Search is an improvement, not a requirement: fall back to the fixed guide and terms.
                logger.warning("knowledge search failed, using the fixed guide: %s", type(error).__name__)
                session.rollback()
                retrieved = []
            if retrieved:
                context, sources = build_rag_context(retrieved)
            else:
                context = build_context(session)
            try:
                tool_results = run_tools(session, payload.message, earlier_questions)
            except SQLAlchemyError as error:
                logger.warning("assistant tools failed: %s", type(error).__name__)
                session.rollback()
                tool_results = []
            context, sources = add_tool_results(context, sources, tool_results)
            context = add_history(context, turns)
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="도우미 답변을 준비하지 못했습니다.") from error
    try:
        return _response(answer_question(settings, payload.message, context, ask, sources))
    except OpenAIError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="도우미 답변을 가져오지 못했습니다.") from error

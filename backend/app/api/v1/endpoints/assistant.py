from fastapi import APIRouter, HTTPException, Request, status
from pydantic import Field
from sqlalchemy.exc import SQLAlchemyError

from app.schemas.daily_briefing import CamelModel
from app.services.assistant_chat import RECOMMEND_PATTERN, AssistantReply, _call, answer_question, build_context
from app.services.openai_client import OpenAIError

router = APIRouter()


class AssistantChatRequest(CamelModel):
    message: str = Field(min_length=1, max_length=200)


class AssistantLinkResponse(CamelModel):
    to: str
    label: str


class AssistantChatResponse(CamelModel):
    answer: str
    links: list[AssistantLinkResponse]
    source: str


def _client_key(request: Request) -> str:
    return request.client.host if request.client else "unknown"


def _response(reply: AssistantReply) -> AssistantChatResponse:
    return AssistantChatResponse(
        answer=reply.answer,
        links=[AssistantLinkResponse(to=path, label=label) for path, label in reply.links],
        source=reply.source,
    )


@router.post("/assistant/chat", response_model=AssistantChatResponse)
def chat_with_assistant(payload: AssistantChatRequest, request: Request) -> AssistantChatResponse:
    settings = request.app.state.settings
    ask = getattr(request.app.state, "assistant_ask", _call)
    # Recommendation questions are answered by a fixed rule and never reach the model or the rate limit.
    if RECOMMEND_PATTERN.search(" ".join(payload.message.split())):
        return _response(answer_question(settings, payload.message, "", ask))
    if not settings.openai_api_key and not hasattr(request.app.state, "assistant_ask"):
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="도우미 답변 기능이 설정되지 않았습니다.")
    if not request.app.state.assistant_limiter.allow(_client_key(request)):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="질문이 너무 많아요. 잠시 후 다시 물어봐 주세요.",
        )
    try:
        with request.app.state.session_factory() as session:
            context = build_context(session)
    except SQLAlchemyError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="도우미 답변을 준비하지 못했습니다.") from error
    try:
        return _response(answer_question(settings, payload.message, context, ask))
    except OpenAIError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="도우미 답변을 가져오지 못했습니다.") from error

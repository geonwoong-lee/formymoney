"""Korean title and short explanation for official English press releases.

The model only sees the official paragraphs. Numbers, forbidden expressions and length are
re-checked here, with one retry, before anything is stored.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from dataclasses import dataclass
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import Settings
from app.services.daily_briefing_service import FORBIDDEN_EXPRESSIONS, NUMBER_PATTERN

RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.6-luna"
MONTHS = {
    name: str(number)
    for number, name in enumerate(
        ["january", "february", "march", "april", "may", "june", "july", "august",
         "september", "october", "november", "december"], start=1,
    )
}
INSTRUCTIONS = (
    "당신은 중앙은행 공식 발표를 한국 독자를 위해 쉬운 한국어로 옮깁니다. "
    "제공한 원문 문단만 사용하세요. 원문에 없는 숫자, 날짜, 원인, 전망, 평가를 만들지 마세요. "
    "title_ko는 영어 제목을 정확히 옮기고, summary_ko는 원문이 말한 사실만 두 문장 이내로 설명합니다. "
    "특정 상품의 추천, 매수·매도, 수익 보장 표현을 쓰지 마세요."
)
SCHEMA = {
    "type": "object",
    "additionalProperties": False,
    "properties": {"title_ko": {"type": "string"}, "summary_ko": {"type": "string"}},
    "required": ["title_ko", "summary_ko"],
}


class InterpretationError(RuntimeError):
    pass


@dataclass(frozen=True)
class Interpretation:
    title_ko: str
    summary_ko: str
    model: str


def validate(title_ko: str, summary_ko: str, source_title: str, paragraphs: list[str]) -> list[str]:
    errors: list[str] = []
    if not title_ko.strip() or len(title_ko) > 500:
        errors.append("한국어 제목이 비었거나 너무 깁니다.")
    if not summary_ko.strip() or len(summary_ko) > 600:
        errors.append("한국어 설명이 비었거나 너무 깁니다.")
    source_text = " ".join([source_title, *paragraphs])
    source_numbers = {token.replace(",", "") for token in NUMBER_PATTERN.findall(source_text)}
    source_numbers.update(number for name, number in MONTHS.items() if name.capitalize() in source_text)
    for token in NUMBER_PATTERN.findall(f"{title_ko} {summary_ko}"):
        if token.replace(",", "") not in source_numbers:
            errors.append(f"원문에서 확인되지 않는 숫자입니다: {token}")
    checked = f"{title_ko} {summary_ko}".replace("불확실", "")
    for expression in FORBIDDEN_EXPRESSIONS:
        if expression in checked:
            errors.append(f"사용할 수 없는 표현입니다: {expression}")
    return list(dict.fromkeys(errors))


def _call_openai(settings: Settings, source: dict[str, object], feedback: list[str]) -> tuple[dict[str, str], str]:
    if not settings.openai_api_key:
        raise InterpretationError("VERY_RICH_OPENAI_API_KEY가 설정되지 않았습니다.")
    model = settings.openai_model or DEFAULT_MODEL
    user_text = json.dumps(source, ensure_ascii=False)
    if feedback:
        user_text += "\n이전 결과가 다음 검증에 실패했습니다. 고쳐서 다시 작성하세요: " + "; ".join(feedback)
    body = {
        "model": model,
        "store": False,
        "reasoning": {"effort": "none"},
        "max_output_tokens": 700,
        "input": [
            {"role": "developer", "content": [{"type": "input_text", "text": INSTRUCTIONS}]},
            {"role": "user", "content": [{"type": "input_text", "text": user_text}]},
        ],
        "text": {"format": {"type": "json_schema", "name": "very_rich_headline_ko", "strict": True, "schema": SCHEMA}},
    }
    request = Request(
        RESPONSES_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings.openai_api_key}"},
    )
    try:
        with urlopen(request, timeout=60) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise InterpretationError(f"OpenAI 응답 오류(HTTP {error.code})") from error
    except (URLError, TimeoutError, ValueError) as error:
        raise InterpretationError("OpenAI에 연결하지 못했습니다.") from error
    text = "".join(
        part.get("text", "")
        for output in payload.get("output", [])
        for part in output.get("content", [])
        if isinstance(part, dict) and part.get("type") == "output_text"
    )
    try:
        parsed = json.loads(text)
        return {"title_ko": str(parsed["title_ko"]).strip(), "summary_ko": str(parsed["summary_ko"]).strip()}, model
    except (ValueError, KeyError) as error:
        raise InterpretationError("OpenAI 결과 형식이 올바르지 않습니다.") from error


OpenAICall = Callable[[Settings, dict[str, object], list[str]], tuple[dict[str, str], str]]


def interpret(
    settings: Settings, title: str, publisher: str, paragraphs: list[str], call: OpenAICall = _call_openai,
) -> Interpretation:
    source = {"publisher": publisher, "title": title, "paragraphs": paragraphs}
    feedback: list[str] = []
    for _attempt in range(2):
        result, model = call(settings, source, feedback)
        feedback = validate(result["title_ko"], result["summary_ko"], title, paragraphs)
        if not feedback:
            return Interpretation(result["title_ko"], result["summary_ko"], model)
    raise InterpretationError("검증을 통과하지 못했습니다: " + "; ".join(feedback))

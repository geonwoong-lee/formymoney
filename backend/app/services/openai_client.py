"""Minimal OpenAI Responses API call with Structured Outputs (no SDK dependency)."""

from __future__ import annotations

import json
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from app.core.config import Settings

RESPONSES_URL = "https://api.openai.com/v1/responses"
DEFAULT_MODEL = "gpt-5.6-luna"


class OpenAIError(RuntimeError):
    pass


def responses_json(
    settings: Settings,
    instructions: str,
    user_text: str,
    schema_name: str,
    schema: dict[str, object],
    max_output_tokens: int = 500,
) -> tuple[dict[str, object], str]:
    if not settings.openai_api_key:
        raise OpenAIError("VERY_RICH_OPENAI_API_KEY가 설정되지 않았습니다.")
    model = settings.openai_model or DEFAULT_MODEL
    body = {
        "model": model,
        "store": False,
        "reasoning": {"effort": "none"},
        "max_output_tokens": max_output_tokens,
        "input": [
            {"role": "developer", "content": [{"type": "input_text", "text": instructions}]},
            {"role": "user", "content": [{"type": "input_text", "text": user_text}]},
        ],
        "text": {"format": {"type": "json_schema", "name": schema_name, "strict": True, "schema": schema}},
    }
    request = Request(
        RESPONSES_URL,
        data=json.dumps(body).encode("utf-8"),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {settings.openai_api_key}"},
    )
    try:
        with urlopen(request, timeout=40) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise OpenAIError(f"OpenAI 응답 오류(HTTP {error.code})") from error
    except (URLError, TimeoutError, ValueError) as error:
        raise OpenAIError("OpenAI에 연결하지 못했습니다.") from error
    text = "".join(
        part.get("text", "")
        for output in payload.get("output", [])
        for part in output.get("content", [])
        if isinstance(part, dict) and part.get("type") == "output_text"
    )
    try:
        parsed = json.loads(text)
    except ValueError as error:
        raise OpenAIError("OpenAI 결과 형식이 올바르지 않습니다.") from error
    if not isinstance(parsed, dict):
        raise OpenAIError("OpenAI 결과 형식이 올바르지 않습니다.")
    return parsed, model

import pytest

from app.collectors.press_text import PressTextError, extract_paragraphs, fetch_paragraphs
from app.core.config import Settings
from app.services.headline_interpreter import InterpretationError, interpret, validate

PARAGRAPHS = [
    "The Governing Council decided to keep the deposit facility rate at 2.00 percent on 29 October 2026.",
    "Inflation is expected to be close to the 2 percent medium-term target over the coming quarters.",
]
SETTINGS = Settings(_env_file=None)


def _fake(*results):
    calls = []

    def call(settings, source, feedback):
        calls.append(list(feedback))
        title_ko, summary_ko = results[min(len(calls) - 1, len(results) - 1)]
        return {"title_ko": title_ko, "summary_ko": summary_ko}, "test-model"

    call.calls = calls
    return call


def test_validate_accepts_numbers_found_in_the_source() -> None:
    errors = validate(
        "통화정책 결정", "유럽중앙은행은 2026년 10월 29일 예금금리를 2.00%로 유지했습니다.",
        "Monetary policy decisions", PARAGRAPHS,
    )

    assert errors == []


def test_validate_rejects_unknown_numbers_and_forbidden_expressions() -> None:
    errors = validate("통화정책 결정", "금리를 3.5%로 올렸고 무조건 오릅니다.", "Monetary policy decisions", PARAGRAPHS)

    assert any("3.5" in message for message in errors)
    assert any("무조건" in message for message in errors)


def test_validate_allows_uncertainty_but_still_blocks_certainty_claims() -> None:
    assert validate("통화정책 결정", "불확실성이 큰 상황입니다.", "Monetary policy decisions", PARAGRAPHS) == []
    assert validate("통화정책 결정", "확실히 오릅니다.", "Monetary policy decisions", PARAGRAPHS) != []


def test_interpret_retries_once_with_the_validation_feedback() -> None:
    call = _fake(("통화정책 결정", "금리를 9%로 올렸습니다."), ("통화정책 결정", "예금금리를 2.00%로 유지했습니다."))

    result = interpret(SETTINGS, "Monetary policy decisions", "European Central Bank", PARAGRAPHS, call=call)

    assert result.summary_ko == "예금금리를 2.00%로 유지했습니다."
    assert result.model == "test-model"
    assert call.calls[0] == [] and "9" in call.calls[1][0]


def test_interpret_gives_up_after_one_retry() -> None:
    call = _fake(("통화정책 결정", "금리를 9%로 올렸습니다."))

    with pytest.raises(InterpretationError):
        interpret(SETTINGS, "Monetary policy decisions", "European Central Bank", PARAGRAPHS, call=call)

    assert len(call.calls) == 2


def test_missing_openai_key_is_reported_without_a_value() -> None:
    with pytest.raises(InterpretationError) as error:
        interpret(SETTINGS, "t", "p", PARAGRAPHS)

    assert "VERY_RICH_OPENAI_API_KEY" in str(error.value)


def test_extract_paragraphs_skips_navigation_and_short_lines() -> None:
    page = (
        "<html><body><nav><p>Home navigation link that is quite long but should be dropped.</p></nav>"
        "<main><p>Short.</p><p>The Board announced approval of an application by a bank holding company today.</p>"
        "<script>var x = 1;</script></main></body></html>"
    )

    assert extract_paragraphs(page) == ["The Board announced approval of an application by a bank holding company today."]


def test_fetch_paragraphs_only_reads_allowed_official_hosts() -> None:
    with pytest.raises(PressTextError):
        fetch_paragraphs("https://evil.example/page")
    with pytest.raises(PressTextError):
        fetch_paragraphs("http://www.ecb.europa.eu/press/x.html")

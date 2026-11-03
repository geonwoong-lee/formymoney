import re
from pathlib import Path

from app.services.knowledge_base import PAGE_PATTERN
from app.services.site_guide import GUIDE

APP = Path(__file__).resolve().parents[2] / "frontend" / "src" / "App.tsx"
# Screens the assistant does not describe on purpose: the front page and detail views of a listed screen.
EXEMPT = {"/"}


def test_every_screen_in_the_app_is_described_for_the_assistant() -> None:
    """A new route must come with a guide line, or the assistant answers that the screen does not exist."""
    routes = {path for path in re.findall(r'<Route path="([^"]+)"', APP.read_text(encoding="utf-8")) if path != "*" and ":" not in path}
    described = {match.group(2) for line in GUIDE.splitlines() if (match := PAGE_PATTERN.match(line))}

    missing = sorted(routes - described - EXEMPT)
    assert not missing, f"가이드(site_guide.py)에 화면 안내가 없는 경로: {missing}"

"""Detect changes in official savings disclosure pages without updating product data."""

from __future__ import annotations

import argparse
import hashlib
import html
import json
import re
import sys
from pathlib import Path
from urllib.request import Request, urlopen


BASELINE = Path(__file__).resolve().parents[1] / "app" / "data" / "savings_source_fingerprints.json"


def fetch_fingerprint(url: str) -> str:
    request = Request(url, headers={"User-Agent": "Very-Rich-source-check/1.0"})
    with urlopen(request, timeout=30) as response:  # noqa: S310 - URLs come from the checked-in baseline
        body = response.read().decode(response.headers.get_content_charset() or "utf-8", errors="replace")
    # 세션값과 번들 해시는 자주 바뀌므로 실제 사용자에게 보이는 본문만 비교한다.
    visible = re.sub(r"(?is)<(script|style)[^>]*>.*?</\1>", " ", body)
    visible = re.sub(r"(?s)<!--.*?-->", " ", visible)
    visible = re.sub(r"<[^>]+>", " ", visible)
    normalized = re.sub(r"\s+", " ", html.unescape(visible)).strip().encode("utf-8")
    return hashlib.sha256(normalized).hexdigest()


def current_fingerprints(baseline: dict[str, object]) -> dict[str, object]:
    sources = baseline.get("sources")
    if not isinstance(sources, list) or not sources:
        raise ValueError("fingerprint baseline has no sources")
    return {
        "sources": [
            {"name": source["name"], "url": source["url"], "sha256": fetch_fingerprint(source["url"])}
            for source in sources
        ]
    }


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--show-current", action="store_true", help="Print current fingerprints for review")
    parser.add_argument("--write-baseline", action="store_true", help="Accept current pages after human review")
    args = parser.parse_args()

    try:
        baseline = json.loads(BASELINE.read_text(encoding="utf-8"))
        current = current_fingerprints(baseline)
    except (OSError, ValueError, KeyError, TypeError, json.JSONDecodeError):
        print("Savings source check failed: an official page or baseline could not be read.", file=sys.stderr)
        return 1

    if args.show_current:
        print(json.dumps(current, ensure_ascii=False, indent=2))
        return 0
    if args.write_baseline:
        BASELINE.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print("Accepted current official-page fingerprints after review.")
        return 0

    previous = {source["url"]: source["sha256"] for source in baseline["sources"]}
    changed = [source["name"] for source in current["sources"] if previous.get(source["url"]) != source["sha256"]]
    if changed:
        print("Official savings pages changed; review product rates and conditions before updating:", file=sys.stderr)
        for name in changed:
            print(f"- {name}", file=sys.stderr)
        return 2
    print(f"Savings source check passed: {len(current['sources'])} official pages unchanged.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

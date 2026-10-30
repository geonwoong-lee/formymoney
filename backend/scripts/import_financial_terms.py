"""Import the 30 candidate financial terms as unreviewed rows.

Source: 경제교육포털 시사경제용어사전 (재정경제부), 공공누리 "출처표시+변경금지".
Definitions are copied as published; only whitespace at the ends is trimmed.
Rows are inserted with is_reviewed=False so nothing is public until a person reviews them.
"""

from __future__ import annotations

import argparse
import html
import sys
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

from sqlalchemy import select

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

from app.core.config import get_settings  # noqa: E402
from app.db.session import create_database_engine, create_session_factory, require_postgres_url  # noqa: E402
from app.models.daily_briefing import FinancialTerm  # noqa: E402

SOURCE_NAME = "경제교육포털 시사경제용어사전(재정경제부)"
SOURCE_URL = "https://www.econedu.go.kr/user/playEcon/currEconTermDoc/menu/list"
CELL = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

# (slug, 용어) — order is the rotation order.
TERMS = [
    ("base-rate", "기준금리"),
    ("monetary-policy-committee", "금융통화위원회"),
    ("call-rate", "콜금리"),
    ("cd-rate", "CD금리"),
    ("negotiable-cd", "양도성예금증서"),
    ("spread-rate", "가산금리"),
    ("contract-rate", "약정금리"),
    ("funding-rate", "조달금리"),
    ("short-term-rate", "단기금리"),
    ("simple-interest", "단리이자"),
    ("compound-interest", "복리이자"),
    ("deposit-protection", "예금자보호"),
    ("insured-deposit", "부보예금"),
    ("tax-free-savings", "비과세저축"),
    ("pension-savings", "연금저축"),
    ("housing-subscription-savings", "주택청약종합저축"),
    ("subscription-deposit", "청약예금"),
    ("eld", "지수연동정기예금(ELD)"),
    ("rate-linked-product", "금리연동형 상품"),
    ("rate-cut-request", "금리인하 요구권"),
    ("loan-refinance", "대환대출"),
    ("overdraft-loan", "마이너스 대출"),
    ("personal-credit-scoring", "개인신용평가시스템"),
    ("credit-recovery-committee", "신용회복위원회"),
    ("savings-bank", "저축은행"),
    ("deposit-intake", "예금수신액"),
    ("checking-deposit", "당좌예금"),
    ("exchange-rate", "환율"),
    ("resident-fx-deposit", "거주자외화예금"),
    ("max-secured-claim", "채권최고액"),
]


def read_definitions(xlsx_path: Path) -> dict[str, str]:
    with zipfile.ZipFile(xlsx_path) as archive:
        shared = [
            "".join(node.text or "" for node in item.iter(CELL + "t"))
            for item in ET.fromstring(archive.read("xl/sharedStrings.xml")).iter(CELL + "si")
        ]
        found: dict[str, str] = {}
        for row in ET.fromstring(archive.read("xl/worksheets/sheet1.xml")).iter(CELL + "row"):
            cells: dict[str, str] = {}
            for cell in row.iter(CELL + "c"):
                value = cell.find(CELL + "v")
                if value is not None and cell.get("t") == "s":
                    cells[cell.get("r")[0]] = shared[int(value.text)]
            name = cells.get("C")
            if name and name not in found:
                found[name] = cells.get("D", "")
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("xlsx", type=Path, help="시사경제용어사전 xlsx 경로")
    args = parser.parse_args()

    definitions = read_definitions(args.xlsx)
    missing = [name for _, name in TERMS if not definitions.get(name, "").strip()]
    if missing:
        print(f"사전에서 찾지 못한 용어: {', '.join(missing)}")
        return 1

    settings = get_settings()
    engine = create_database_engine(require_postgres_url(settings.database_url))
    added = 0
    with create_session_factory(engine)() as session:
        for slug, name in TERMS:
            exists = session.scalar(select(FinancialTerm.id).where(FinancialTerm.slug == slug))
            if exists is not None:
                continue
            session.add(FinancialTerm(
                slug=slug,
                name=name,
                short_definition=html.unescape(html.unescape(definitions[name])).strip(),
                example="",
                source_name=SOURCE_NAME,
                source_url=SOURCE_URL,
                is_reviewed=False,
            ))
            added += 1
        session.commit()
    print(f"새로 추가 {added}개, 이미 있음 {len(TERMS) - added}개 (모두 검수 전 상태)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

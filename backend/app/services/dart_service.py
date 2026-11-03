"""Stored DART data turned into what the screens show: a bank's main accounts with plain ratios, and recent filings.

Ratios are arithmetic on the reported numbers (the site's one calculation place); none of them is a soundness grade
such as the BIS ratio, and nothing here says a bank is safe or risky.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta, timezone
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.collectors.dart import BANK_CORPS, VIEWER_URL, Filing, MainAccounts
from app.models.dart import BankFinancial, DartFiling

KEEP_FILING_DAYS = 60
LABELS: dict[str, str] = {
    "assets": "자산총계",
    "liabilities": "부채총계",
    "equity": "자본총계",
    "deposits": "예수부채(고객이 맡긴 예금)",
    "interest_income": "이자수익",
    "interest_expense": "이자비용",
    "net_interest": "순이자손익",
    "operating_income": "영업이익",
    "net_income": "당기순이익",
    "capital": "자본금",
    "retained_earnings": "이익잉여금",
    "fvtpl_assets": "당기손익-공정가치측정금융자산",
    "fvoci_assets": "기타포괄손익-공정가치측정금융자산",
    "derivative_assets": "파생상품자산",
    "derivative_liabilities": "파생상품부채",
    "net_fee": "순수수료손익",
    "pretax_income": "법인세차감전 순이익",
}
SHOWN = ["assets", "liabilities", "equity", "deposits", "net_interest", "net_income"]
# Paperwork banks file every time they issue bonds; it would bury results, dividends and major-event reports.
ROUTINE_BOND_FILINGS = ("투자설명서", "일괄신고추가서류", "일괄신고서", "증권발행실적보고서", "증권신고서(채무증권)")


def _percent(part: Decimal | None, whole: Decimal | None) -> str | None:
    if part is None or not whole:
        return None
    return str((part / whole * 100).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def _amounts(raw: dict[str, str]) -> dict[str, Decimal]:
    return {key: Decimal(value) for key, value in raw.items()}


def with_net_interest(amounts: dict[str, Decimal]) -> dict[str, Decimal]:
    """Some banks report only interest income and expense; their difference is the net interest."""
    if "net_interest" not in amounts and "interest_income" in amounts and "interest_expense" in amounts:
        return {**amounts, "net_interest": amounts["interest_income"] - amounts["interest_expense"]}
    return amounts


def _line(key: str | None, label: str, value: Decimal | None) -> dict[str, str | None]:
    return {"key": key, "label": label, "amount": str(value) if value is not None else None}


def _section(amounts: dict[str, Decimal], total_key: str, parts: list[str], rest_label: str) -> dict[str, object]:
    """A total with the lines DART lists under it, plus what is left over as one "그 밖의" line."""
    total = amounts.get(total_key)
    lines = [_line(key, LABELS[key], amounts[key]) for key in parts if key in amounts]
    if total is not None:
        rest = total - sum((amounts[key] for key in parts if key in amounts), Decimal("0"))
        if rest != 0:  # can be negative for equity (e.g. accumulated other comprehensive loss)
            lines.append(_line(None, rest_label, rest))
    return {"label": LABELS[total_key], "total": str(total) if total is not None else None, "lines": lines}


def statements(amounts: dict[str, Decimal]) -> dict[str, object]:
    """The balance sheet as its two sides and a short income statement, from the reported main accounts.

    DART's main accounts for banks have no current/non-current split and no loan line, so the asset side lists
    the financial assets DART does report and puts the rest (mostly loans and cash) in one remainder line.
    """
    income = [_line(key, LABELS[key], amounts[key]) for key in
              ("interest_income", "interest_expense", "net_interest", "net_fee", "operating_income", "pretax_income", "net_income")
              if key in amounts]
    return {
        "balanceSheet": {
            "assets": _section(amounts, "assets", ["fvtpl_assets", "fvoci_assets", "derivative_assets"], "그 밖의 자산(대출채권·현금 등)"),
            "liabilities": _section(amounts, "liabilities", ["deposits", "derivative_liabilities"], "그 밖의 부채(은행이 낸 채권·빌린 돈 등)"),
            "equity": _section(amounts, "equity", ["capital", "retained_earnings"], "그 밖의 자본(자본잉여금 등)"),
        },
        "incomeStatement": income,
    }


class DartService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_financials(self, bank_code: str, accounts: MainAccounts, now: datetime | None = None) -> None:
        row = self.session.scalar(select(BankFinancial).where(BankFinancial.bank_code == bank_code))
        if row is None:
            row = BankFinancial(bank_code=bank_code)
            self.session.add(row)
        row.corp_code = accounts.corp_code
        row.corp_name = BANK_CORPS.get(bank_code, (accounts.corp_code, bank_code))[1]
        row.year = accounts.year
        row.fs_div = accounts.fs_div
        row.period_end = accounts.period_end
        row.receipt_no = accounts.receipt_no
        row.current = {key: str(value) for key, value in accounts.current.items()}
        row.previous = {key: str(value) for key, value in accounts.previous.items()}
        row.fetched_at = now or datetime.now(timezone.utc)
        self.session.commit()

    def financials(self, bank_code: str) -> dict[str, object] | None:
        row = self.session.scalar(select(BankFinancial).where(BankFinancial.bank_code == bank_code))
        if row is None:
            return None
        current, previous = with_net_interest(_amounts(row.current)), with_net_interest(_amounts(row.previous))
        items = []
        for key in SHOWN:
            now_value, before = current.get(key), previous.get(key)
            items.append({
                "key": key, "label": LABELS[key],
                "current": str(now_value) if now_value is not None else None,
                "previous": str(before) if before is not None else None,
                "changePercent": _percent(now_value - before, abs(before)) if now_value is not None and before else None,
            })
        assets, liabilities, equity = current.get("assets"), current.get("liabilities"), current.get("equity")
        balanced = None
        if assets is not None and liabilities is not None and equity is not None:
            # 자산 = 부채 + 자본 should hold to the won; a gap means a missing or rounded account.
            balanced = abs(assets - liabilities - equity) <= max(Decimal("1"), assets * Decimal("0.000001"))
        return {
            "peers": self._peer_ranges(),
            "bankCode": row.bank_code, "corpName": row.corp_name, "year": row.year,
            "statement": "별도재무제표" if row.fs_div == "OFS" else "연결재무제표", "periodEnd": row.period_end,
            "items": items,
            "ratios": {
                "equityToAssets": _percent(equity, assets),
                "depositsToLiabilities": _percent(current.get("deposits"), liabilities),
                "netIncomeToAssets": _percent(current.get("net_income"), assets),
            },
            "balanced": balanced,
            "statements": statements(current),
            "sourceName": "금융감독원 전자공시시스템(DART) 사업보고서",
            "sourceUrl": f"{VIEWER_URL}{row.receipt_no}",
            "fetchedAt": row.fetched_at.isoformat(),
        }

    def _peer_ranges(self) -> dict[str, dict[str, object]]:
        """Lowest and highest of each ratio among the stored banks, as a frame of reference, not a grade."""
        values: dict[str, list[tuple[Decimal, str]]] = {"equityToAssets": [], "depositsToLiabilities": [], "netIncomeToAssets": []}
        for row in self.session.scalars(select(BankFinancial)):
            amounts = _amounts(row.current)
            for key, part, whole in (
                ("equityToAssets", "equity", "assets"), ("depositsToLiabilities", "deposits", "liabilities"), ("netIncomeToAssets", "net_income", "assets"),
            ):
                ratio = _percent(amounts.get(part), amounts.get(whole))
                if ratio is not None:
                    values[key].append((Decimal(ratio), row.corp_name))
        ranges = {}
        for key, found in values.items():
            if found:
                low, high = min(found), max(found)
                ranges[key] = {"count": len(found), "min": str(low[0]), "minBank": low[1], "max": str(high[0]), "maxBank": high[1]}
        return ranges

    def banks_with_financials(self) -> list[dict[str, str]]:
        rows = self.session.scalars(select(BankFinancial).order_by(BankFinancial.bank_code))
        return [{"bankCode": row.bank_code, "corpName": row.corp_name} for row in rows]

    def save_filings(self, filings: list[Filing], today: date, now: datetime | None = None) -> int:
        known = set(self.session.scalars(select(DartFiling.receipt_no).where(DartFiling.receipt_no.in_([f.receipt_no for f in filings]))))
        added = 0
        for filing in filings:
            if filing.receipt_no in known:
                continue
            known.add(filing.receipt_no)
            self.session.add(DartFiling(
                receipt_no=filing.receipt_no, corp_code=filing.corp_code, corp_name=filing.corp_name, title=filing.title[:300],
                filed_on=filing.filed_on, filer=filing.filer, fetched_at=now or datetime.now(timezone.utc),
            ))
            added += 1
        self.session.execute(delete(DartFiling).where(DartFiling.filed_on < today - timedelta(days=KEEP_FILING_DAYS)))
        self.session.commit()
        return added

    def recent_filings(self, today: date, days: int, limit: int) -> tuple[list[dict[str, str]], int]:
        """Recent filings without the routine bond paperwork, and how many of those were left out."""
        rows = list(self.session.scalars(
            select(DartFiling).where(DartFiling.filed_on >= today - timedelta(days=days - 1))
            .order_by(DartFiling.filed_on.desc(), DartFiling.receipt_no.desc())
        ))
        kept = [row for row in rows if not any(word in row.title for word in ROUTINE_BOND_FILINGS)]
        return [{
            "receiptNo": row.receipt_no, "corpName": row.corp_name, "title": row.title,
            "filedOn": row.filed_on.isoformat(), "filer": row.filer, "url": f"{VIEWER_URL}{row.receipt_no}",
        } for row in kept[:limit]], len(rows) - len(kept)

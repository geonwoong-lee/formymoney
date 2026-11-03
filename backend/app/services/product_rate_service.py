"""Daily 금융감독원 product rate snapshots and what changed since the previous collection day.

Only the changes are shown, in percentage points; nothing is ranked as a better or worse product.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.collectors.finlife import ProductRate
from app.models.product_rate import ProductInfo, ProductRateSnapshot

KEEP_DAYS = 60  # about 3,600 rows (~1 MB with indexes) a day, so ~60 MB; enough to draw a rate's path
# The site's bank codes and how 금감원 names those banks. 우체국 is not in the disclosure.
FINLIFE_COMPANIES = {
    "kb": "국민은행", "shinhan": "신한은행", "nh": "농협은행주식회사", "woori": "우리은행", "hana": "주식회사 하나은행",
    "ibk": "중소기업은행", "sh": "수협은행", "im": "아이엠뱅크", "busan": "부산은행", "gwangju": "광주은행",
    "jeonbuk": "전북은행", "gyeongnam": "경남은행", "kakao": "주식회사 카카오뱅크",
}


def shown_company(name: str) -> str:
    """"주식회사 케이뱅크" and "토스뱅크 주식회사" read as 케이뱅크 and 토스뱅크."""
    return " ".join(word for word in name.replace("(주)", " ").split() if word != "주식회사") or name
Key = tuple[str, str, str, int, str, str]


def _key(row: ProductRateSnapshot | ProductRate) -> Key:
    return (row.kind, row.company, row.product_code, row.term_months, row.rate_type, row.reserve_type)


class ProductRateService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_snapshot(self, day: date, rates: list[ProductRate]) -> int:
        """Replace that day's snapshot (a re-run on the same day overwrites it) and drop days older than KEEP_DAYS."""
        self.session.execute(delete(ProductRateSnapshot).where(ProductRateSnapshot.day == day))
        seen: set[Key] = set()
        for rate in rates:
            if _key(rate) in seen:
                continue
            seen.add(_key(rate))
            self.session.add(ProductRateSnapshot(
                day=day, kind=rate.kind, group=rate.group, company=rate.company, product_code=rate.product_code,
                product_name=rate.product_name, term_months=rate.term_months, rate_type=rate.rate_type,
                reserve_type=rate.reserve_type, base_rate=rate.base_rate, max_rate=rate.max_rate,
                disclosed_month=rate.disclosed_month,
            ))
        self._save_infos(day, rates)
        self.session.execute(delete(ProductRateSnapshot).where(ProductRateSnapshot.day < date.fromordinal(day.toordinal() - KEEP_DAYS)))
        self.session.commit()
        return len(seen)

    def _save_infos(self, day: date, rates: list[ProductRate]) -> None:
        """Keep each product's latest joining terms; a product that stops being disclosed keeps its last terms."""
        infos = {(info.kind, info.company, info.product_code): info for rate in rates if (info := rate.info) is not None}
        if not infos:
            return
        known = {(row.kind, row.company, row.product_code): row for row in self.session.scalars(
            select(ProductInfo).where(ProductInfo.product_code.in_({key[2] for key in infos}))
        )}
        for key, info in infos.items():
            row = known.get(key)
            if row is None:
                row = ProductInfo(kind=info.kind, company=info.company, product_code=info.product_code)
                self.session.add(row)
            row.join_way = info.join_way[:200]
            row.join_member = info.join_member
            row.join_limit = info.join_limit
            row.special_conditions = info.special_conditions
            row.max_limit = info.max_limit
            row.etc_note = info.etc_note
            row.maturity_interest = info.maturity_interest
            row.updated_on = day

    def _latest_two(self) -> tuple[list[date], dict[Key, ProductRateSnapshot], dict[Key, ProductRateSnapshot]]:
        days = list(self.session.scalars(
            select(ProductRateSnapshot.day).group_by(ProductRateSnapshot.day).order_by(ProductRateSnapshot.day.desc()).limit(2)
        ))
        snapshot = lambda day: {_key(row): row for row in self.session.scalars(select(ProductRateSnapshot).where(ProductRateSnapshot.day == day))}  # noqa: E731
        latest = snapshot(days[0]) if days else {}
        previous = snapshot(days[1]) if len(days) > 1 else {}
        return days, latest, previous

    @staticmethod
    def _diff(latest: dict[Key, ProductRateSnapshot], previous: dict[Key, ProductRateSnapshot]) -> list[dict[str, str | int]]:
        changes = []
        for key, row in latest.items():
            before = previous.get(key)
            if before is None:
                continue
            for field, label in (("base_rate", "기본금리"), ("max_rate", "최고 우대금리")):
                old, new = getattr(before, field), getattr(row, field)
                if old is None or new is None or Decimal(old) == Decimal(new):
                    continue
                changes.append({
                    "kind": row.kind, "group": row.group, "company": row.company, "productCode": row.product_code,
                    "productName": row.product_name, "termMonths": row.term_months, "rateType": row.rate_type,
                    "reserveType": row.reserve_type, "field": field, "fieldLabel": label,
                    "before": str(Decimal(old)), "after": str(Decimal(new)), "changePoint": str(Decimal(new) - Decimal(old)),
                })
        changes.sort(key=lambda item: (-abs(Decimal(item["changePoint"])), item["company"], item["productName"], item["termMonths"]))
        return changes

    def changes(self) -> dict[str, object]:
        days, latest, previous = self._latest_two()
        empty = {"latestDay": None, "previousDay": None, "productCount": 0, "changes": [], "added": 0, "removed": 0}
        if not days:
            return empty
        if len(days) < 2:
            return {**empty, "latestDay": days[0].isoformat(), "productCount": len(latest)}
        return {
            "latestDay": days[0].isoformat(), "previousDay": days[1].isoformat(), "productCount": len(latest),
            "changes": self._diff(latest, previous),
            "added": len(latest.keys() - previous.keys()), "removed": len(previous.keys() - latest.keys()),
        }

    def alerts(self, bank_code: str | None, watched: list[tuple[str, str, str]]) -> dict[str, object]:
        """Only the moves that concern this person: their savings bank's own products and the products they starred.

        `watched` holds (kind, company as shown on screen, product code); companies are compared after dropping
        "주식회사" the same way the product list shows them.
        """
        days, latest, previous = self._latest_two()
        company = FINLIFE_COMPANIES.get(bank_code or "")
        bank = None if company is None else {"bankCode": bank_code, "company": shown_company(company), "changes": []}
        result = {
            "latestDay": days[0].isoformat() if days else None, "previousDay": days[1].isoformat() if len(days) > 1 else None,
            "bank": bank, "watched": [],
        }
        if len(days) < 2:
            return result
        changes = self._diff(latest, previous)
        wanted = {(kind, name, code) for kind, name, code in watched}
        if bank is not None:
            bank["changes"] = [item for item in changes if item["company"] == company]
        result["watched"] = [
            item for item in changes
            if (item["kind"], shown_company(str(item["company"])), item["productCode"]) in wanted
        ]
        return result

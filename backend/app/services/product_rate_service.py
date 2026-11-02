"""Daily 금융감독원 product rate snapshots and what changed since the previous collection day.

Only the changes are shown, in percentage points; nothing is ranked as a better or worse product.
"""

from __future__ import annotations

from datetime import date
from decimal import Decimal

from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from app.collectors.finlife import ProductRate
from app.models.product_rate import ProductRateSnapshot

KEEP_DAYS = 14
Key = tuple[str, str, str, int, str, str]


def _key(row: ProductRateSnapshot | ProductRate) -> Key:
    return (row.kind, row.company, row.product_code, row.term_months, row.rate_type, row.reserve_type)


class ProductRateService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def save_snapshot(self, day: date, rates: list[ProductRate]) -> int:
        """Replace that day's snapshot (a re-run on the same day overwrites it) and drop days older than two weeks."""
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
        self.session.execute(delete(ProductRateSnapshot).where(ProductRateSnapshot.day < date.fromordinal(day.toordinal() - KEEP_DAYS)))
        self.session.commit()
        return len(seen)

    def changes(self) -> dict[str, object]:
        days = list(self.session.scalars(
            select(ProductRateSnapshot.day).group_by(ProductRateSnapshot.day).order_by(ProductRateSnapshot.day.desc()).limit(2)
        ))
        empty = {"latestDay": None, "previousDay": None, "productCount": 0, "changes": [], "added": 0, "removed": 0}
        if not days:
            return empty
        latest = {_key(row): row for row in self.session.scalars(select(ProductRateSnapshot).where(ProductRateSnapshot.day == days[0]))}
        if len(days) < 2:
            return {**empty, "latestDay": days[0].isoformat(), "productCount": len(latest)}
        previous = {_key(row): row for row in self.session.scalars(select(ProductRateSnapshot).where(ProductRateSnapshot.day == days[1]))}
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
                    "kind": row.kind, "group": row.group, "company": row.company, "productName": row.product_name,
                    "termMonths": row.term_months, "rateType": row.rate_type, "reserveType": row.reserve_type,
                    "field": field, "fieldLabel": label, "before": str(Decimal(old)), "after": str(Decimal(new)),
                    "changePoint": str(Decimal(new) - Decimal(old)),
                })
        changes.sort(key=lambda item: (-abs(Decimal(item["changePoint"])), item["company"], item["productName"], item["termMonths"]))
        return {
            "latestDay": days[0].isoformat(), "previousDay": days[1].isoformat(), "productCount": len(latest),
            "changes": changes, "added": len(latest.keys() - previous.keys()), "removed": len(previous.keys() - latest.keys()),
        }

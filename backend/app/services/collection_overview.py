"""What each daily collection last brought in, for the operator's overview screen.

Every source reports its latest day and size, so a source that quietly stopped shows up as an old date.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.collectors.ecos import SERIES_BY_CODE
from app.models.dart import BankFinancial, DartFiling
from app.models.loan_product import LoanProduct
from app.models.market import MarketPoint
from app.models.product_rate import ProductInfo, ProductRateSnapshot

STALE_DAYS = 2


def _stale(day: date | None, today: date) -> bool:
    return day is None or (today - day) > timedelta(days=STALE_DAYS)


def collection_overview(session: Session, today: date) -> dict[str, object]:
    rate_day = session.scalar(select(func.max(ProductRateSnapshot.day)))
    rate_count = session.scalar(select(func.count()).select_from(ProductRateSnapshot).where(ProductRateSnapshot.day == rate_day)) if rate_day else 0
    loan_day = session.scalar(select(func.max(LoanProduct.updated_on)))
    loan_count = session.scalar(select(func.count()).select_from(LoanProduct)) or 0
    filing_day = session.scalar(select(func.max(DartFiling.filed_on)))

    latest_fetch = {
        code: fetched for code, fetched in session.execute(select(MarketPoint.series_code, func.max(MarketPoint.fetched_at)).group_by(MarketPoint.series_code))
    }
    latest_period = {
        code: period for code, period in session.execute(select(MarketPoint.series_code, func.max(MarketPoint.period)).group_by(MarketPoint.series_code))
    }
    market = [
        {
            "code": code, "name": SERIES_BY_CODE[code].name if code in SERIES_BY_CODE else code, "period": latest_period[code],
            "fetchedAt": fetched.isoformat() if isinstance(fetched, datetime) else None,
        }
        for code, fetched in sorted(latest_fetch.items())
    ]
    return {
        "today": today.isoformat(),
        "productRates": {"day": rate_day.isoformat() if rate_day else None, "rows": int(rate_count or 0), "stale": _stale(rate_day, today)},
        "productInfos": {"rows": int(session.scalar(select(func.count()).select_from(ProductInfo)) or 0)},
        "loans": {"day": loan_day.isoformat() if loan_day else None, "rows": int(loan_count), "stale": _stale(loan_day, today)},
        "dart": {
            "banks": int(session.scalar(select(func.count()).select_from(BankFinancial)) or 0),
            "latestFilingDay": filing_day.isoformat() if filing_day else None,
        },
        "market": market,
    }

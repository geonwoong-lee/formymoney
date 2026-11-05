"""우대조건 익명 집계: 통계에 동의한 방문자가 은행 비교에서 고른 우대조건 답(예·아니오·모름)을 은행·조건별 하루 횟수로만 센다.

사람·기기·IP는 받지 않고, 한 사람의 여러 답을 서로 잇지 않는다. 그래서 숫자는 "사람 수"가 아니라 "응답 수"이며,
같은 브라우저는 하루 한 번만 보낸다(브라우저가 지킴). 응답이 적은 조건은 누가 어떻게 답했는지 짐작되지 않도록 숨긴다.
"""

from __future__ import annotations

from datetime import date, timedelta

from sqlalchemy import func, select
from sqlalchemy.dialects import postgresql, sqlite
from sqlalchemy.orm import Session

from app.models.analytics import ConditionAnswerDailyCount
from app.repositories.savings_repository import SavingsRepository

ANSWERS = ("yes", "no", "unknown")
# 이보다 응답이 적은 조건은 비율을 보여 주지 않는다.
MINIMUM_RESPONSES = 20
# 한 답이라도 1건 이상 이 수 미만이면(예: "모른다" 1건) 그 조건 전체를 숨긴다. 칸 몇 개만 숨기면 총 응답 수와 남은 비율로 거꾸로 계산된다.
# 0건은 아무의 답도 아니므로 그대로 보인다.
MINIMUM_CELL = 5
DEFAULT_DAYS = 90


class ConditionStatsInputError(ValueError):
    pass


class ConditionStatsService:
    def __init__(self, session: Session) -> None:
        self.session = session

    def _known_conditions(self) -> dict[str, dict[str, object]]:
        return {
            product.bank_code: {"product": product, "conditions": {condition.code: condition for condition in product.conditions}}
            for product in SavingsRepository(self.session).list_products()
        }

    def record(self, answers: dict[str, dict[str, str]], day: date) -> int:
        known = self._known_conditions()
        rows: list[tuple[str, str, str]] = []
        for bank_code, bank_answers in answers.items():
            if bank_code not in known:
                raise ConditionStatsInputError(f"모르는 은행입니다: {bank_code}")
            for condition_code, answer in bank_answers.items():
                if condition_code not in known[bank_code]["conditions"]:
                    raise ConditionStatsInputError(f"{bank_code}의 모르는 조건입니다: {condition_code}")
                if answer not in ANSWERS:
                    raise ConditionStatsInputError(f"답은 yes, no, unknown 중 하나여야 합니다: {answer}")
                rows.append((bank_code, condition_code, answer))
        # 동시에 들어온 요청끼리 횟수를 잃지 않도록 DB 안에서 한 번에 더한다(INSERT ... ON CONFLICT DO UPDATE).
        dialect = self.session.get_bind().dialect.name
        insert = postgresql.insert if dialect == "postgresql" else sqlite.insert
        table = ConditionAnswerDailyCount.__table__
        for bank_code, condition_code, answer in rows:
            statement = insert(table).values(day=day, bank_code=bank_code, condition_code=condition_code, answer=answer, count=1)
            self.session.execute(statement.on_conflict_do_update(
                index_elements=["day", "bank_code", "condition_code", "answer"],
                set_={"count": table.c.count + 1},
            ))
        self.session.commit()
        return len(rows)

    def stats(self, today: date, days: int = DEFAULT_DAYS) -> dict[str, object]:
        start = today - timedelta(days=days - 1)
        totals: dict[tuple[str, str], dict[str, int]] = {}
        for bank_code, condition_code, answer, count in self.session.execute(
            select(
                ConditionAnswerDailyCount.bank_code,
                ConditionAnswerDailyCount.condition_code,
                ConditionAnswerDailyCount.answer,
                func.sum(ConditionAnswerDailyCount.count),
            )
            .where(ConditionAnswerDailyCount.day >= start, ConditionAnswerDailyCount.day <= today)
            .group_by(ConditionAnswerDailyCount.bank_code, ConditionAnswerDailyCount.condition_code, ConditionAnswerDailyCount.answer)
        ).all():
            totals.setdefault((bank_code, condition_code), {})[answer] = int(count or 0)

        banks = []
        for bank_code, entry in self._known_conditions().items():
            product = entry["product"]
            conditions = []
            for condition in product.conditions:
                counts = totals.get((bank_code, condition.code), {})
                responses = sum(counts.values())
                shown = responses >= MINIMUM_RESPONSES and not any(0 < count < MINIMUM_CELL for count in counts.values())
                conditions.append({
                    "code": condition.code,
                    "title": condition.title,
                    "bonusRate": float(condition.bonus_rate),
                    "shown": shown,
                    # 숨긴 조건은 응답 수도 알려 주지 않는다(적은 수 자체가 단서가 될 수 있음).
                    "responses": responses if shown else None,
                    "yesPercent": _percent(counts.get("yes", 0), responses) if shown else None,
                    "noPercent": _percent(counts.get("no", 0), responses) if shown else None,
                    "unknownPercent": _percent(counts.get("unknown", 0), responses) if shown else None,
                })
            banks.append({"bankCode": bank_code, "bankName": product.bank_name, "conditions": conditions})
        return {
            "start": start.isoformat(),
            "end": today.isoformat(),
            "minimumResponses": MINIMUM_RESPONSES,
            "banks": banks,
        }


def _percent(part: int, whole: int) -> float:
    # 정수 %로만 알려 응답 수와 곱해 정확한 건수를 되살리기 어렵게 한다.
    return float(round(part / whole * 100)) if whole else 0.0

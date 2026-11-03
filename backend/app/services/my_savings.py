"""One screen of "my savings": where I am in the term, what I have paid, what I expect at maturity, which bonus
conditions count and what checking the unknown ones could add. Every number comes from the savings calculation.
"""

from __future__ import annotations

from datetime import date

from app.schemas.savings import (
    Answer,
    CashflowCalculationRequest,
    ConditionImpact,
    MyConditions,
    MyPayments,
    MyStatusRequest,
    MyStatusResponse,
    MyTimeline,
)
from app.services.savings_service import SavingsService


def _month_index(month: str) -> int:
    year, number = month.split("-")
    return int(year) * 12 + int(number) - 1


def _month_label(index: int) -> str:
    return f"{index // 12}-{index % 12 + 1:02d}"


def _timeline(request: MyStatusRequest, term: int, today: date) -> MyTimeline:
    if not request.start_month:
        return MyTimeline(phase="unknown", start_month=None, maturity_month=None, current_round=None, term_months=term, months_to_maturity=None)
    start = _month_index(request.start_month)
    maturity = start + term
    now = today.year * 12 + today.month - 1
    if now < start or not request.enrolled:
        phase, current = "before_start", None
    elif now >= maturity:
        phase, current = "matured", None
    else:
        phase, current = "saving", now - start + 1
    return MyTimeline(
        phase=phase, start_month=request.start_month, maturity_month=_month_label(maturity), current_round=current,
        term_months=term, months_to_maturity=max(0, maturity - now),
    )


def _payments(amounts: list[int], fixed: int, timeline: MyTimeline) -> MyPayments:
    past = timeline.current_round if timeline.phase == "saving" else len(amounts) if timeline.phase == "matured" else 0
    done, ahead = amounts[:past], amounts[past:]
    return MyPayments(
        paid_rounds=sum(1 for amount in done if amount > 0), paid_amount=sum(done),
        remaining_rounds=sum(1 for amount in ahead if amount > 0), remaining_amount=sum(ahead),
        skipped_rounds=[round_ for round_, amount in enumerate(done, 1) if amount == 0],
        reduced_rounds=[round_ for round_, amount in enumerate(done, 1) if 0 < amount < fixed],
    )


def my_status(service: SavingsService, request: MyStatusRequest, today: date) -> MyStatusResponse:
    cashflow_request = CashflowCalculationRequest(
        bank_code=request.bank_code, monthly_amounts=request.monthly_amounts, fixed_monthly_amount=request.fixed_monthly_amount,
        contribution_type=request.contribution_type, condition_answers=request.condition_answers,
    )
    cashflow = service.calculate_cashflow(cashflow_request)
    conditions = cashflow.result.conditions
    unknown = [item for item in conditions if item.status == "needs_review" and item.answer == Answer.unknown]

    if_checked_amount = if_checked_gain = None
    if unknown:
        answers = {**request.condition_answers, **{item.code: Answer.yes for item in unknown}}
        checked = service.calculate_cashflow(cashflow_request.model_copy(update={"condition_answers": answers}))
        if_checked_amount = checked.result.expected_maturity_amount
        if_checked_gain = if_checked_amount - cashflow.result.expected_maturity_amount

    base = cashflow.result.expected_maturity_amount
    impacts = []
    for item in conditions:
        if item.status != "applied":
            continue
        missed = service.calculate_cashflow(cashflow_request.model_copy(update={"condition_answers": {**request.condition_answers, item.code: Answer.no}}))
        impacts.append(ConditionImpact(code=item.code, maturity_amount=missed.result.expected_maturity_amount, loss=base - missed.result.expected_maturity_amount))

    timeline = _timeline(request, cashflow.term_months, today)
    return MyStatusResponse(
        timeline=timeline,
        payments=_payments(cashflow.monthly_amounts, request.fixed_monthly_amount, timeline),
        cashflow=cashflow,
        conditions=MyConditions(
            applied=[item for item in conditions if item.status == "applied"],
            not_applied=[item for item in conditions if item.status == "not_applied"],
            needs_check=[item for item in conditions if item.status == "needs_review"],
            if_checked_maturity_amount=if_checked_amount, if_checked_gain=if_checked_gain, impacts=impacts,
        ),
    )

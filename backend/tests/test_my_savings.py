from datetime import date

from fastapi.testclient import TestClient

from app.api.v1.endpoints import savings as savings_endpoint


def _status(client: TestClient, monkeypatch, today: date = date(2026, 11, 3), **changes: object):
    monkeypatch.setattr(savings_endpoint, "korea_today", lambda: today)
    payload = {
        "bankCode": "kb", "monthlyAmounts": [500_000] * 36, "fixedMonthlyAmount": 500_000, "contributionType": "general",
        "conditionAnswers": {}, "startMonth": "2026-01", "enrolled": True,
    }
    payload.update(changes)
    return client.post("/api/v1/savings/my-status", json=payload)


def test_status_places_this_month_in_the_term_and_counts_what_was_paid(client: TestClient, monkeypatch) -> None:
    amounts = [500_000, 0, 250_000] + [500_000] * 33
    body = _status(client, monkeypatch, monthlyAmounts=amounts).json()

    assert body["timeline"] == {
        "phase": "saving", "startMonth": "2026-01", "maturityMonth": "2029-01", "currentRound": 11, "termMonths": 36, "monthsToMaturity": 26,
    }
    payments = body["payments"]
    assert (payments["paidRounds"], payments["paidAmount"]) == (10, sum(amounts[:11]))
    assert (payments["remainingRounds"], payments["remainingAmount"]) == (25, sum(amounts[11:]))
    assert (payments["skippedRounds"], payments["reducedRounds"]) == ([2], [3])
    # The expected maturity amount is the cash-flow calculation's, with the skipped and reduced months in it.
    cashflow = client.post("/api/v1/savings/calculate-cashflow", json={
        "bankCode": "kb", "monthlyAmounts": amounts, "fixedMonthlyAmount": 500_000, "contributionType": "general", "conditionAnswers": {},
    }).json()
    assert body["cashflow"]["result"]["expectedMaturityAmount"] == cashflow["result"]["expectedMaturityAmount"]


def test_status_shows_what_checking_the_unknown_conditions_could_add(client: TestClient, monkeypatch) -> None:
    body = _status(client, monkeypatch).json()
    conditions = body["conditions"]
    assert conditions["applied"] == [] and conditions["needsCheck"]
    answers = {item["code"]: "yes" for item in conditions["needsCheck"]}
    if_yes = _status(client, monkeypatch, conditionAnswers=answers).json()

    assert conditions["ifCheckedMaturityAmount"] == if_yes["cashflow"]["result"]["expectedMaturityAmount"]
    assert conditions["ifCheckedGain"] == conditions["ifCheckedMaturityAmount"] - body["cashflow"]["result"]["expectedMaturityAmount"]
    assert conditions["ifCheckedGain"] > 0
    no_unknowns = _status(client, monkeypatch, conditionAnswers={code: "no" for code in answers}).json()["conditions"]
    assert (no_unknowns["ifCheckedGain"], len(no_unknowns["notApplied"])) == (None, len(answers))


def test_status_before_the_start_after_maturity_and_without_a_start_month(client: TestClient, monkeypatch) -> None:
    before = _status(client, monkeypatch, startMonth="2026-12").json()
    assert (before["timeline"]["phase"], before["timeline"]["currentRound"], before["payments"]["paidRounds"]) == ("before_start", None, 0)
    considering = _status(client, monkeypatch, enrolled=False).json()
    assert considering["timeline"]["phase"] == "before_start" and considering["payments"]["remainingRounds"] == 36

    done = _status(client, monkeypatch, today=date(2029, 2, 1)).json()
    assert (done["timeline"]["phase"], done["timeline"]["monthsToMaturity"], done["payments"]["paidRounds"]) == ("matured", 0, 36)
    unknown = _status(client, monkeypatch, startMonth=None).json()
    assert unknown["timeline"]["phase"] == "unknown" and unknown["timeline"]["maturityMonth"] is None
    assert _status(client, monkeypatch, startMonth="2026-13").status_code == 422

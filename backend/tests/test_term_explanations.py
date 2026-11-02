import re

from fastapi.testclient import TestClient
from sqlalchemy import select

from app.models.daily_briefing import FinancialTerm
from scripts.import_financial_terms import update_explanations
from scripts.term_easy_explanations import EASY_EXPLANATIONS


def _add_terms(session_factory, names) -> None:
    with session_factory() as session:
        for index, name in enumerate(names):
            session.add(FinancialTerm(
                slug=f"t{index}", name=name, short_definition=f"공식 {name}", example="예전 설명",
                source_name="s", source_url="https://e.kr", is_reviewed=index % 2 == 0,
            ))
        session.commit()


def test_explanations_only_updates_every_term_and_keeps_definitions(client: TestClient) -> None:
    factory = client.app.state.session_factory
    _add_terms(factory, EASY_EXPLANATIONS)

    assert update_explanations(factory) == 0

    with factory() as session:
        terms = session.scalars(select(FinancialTerm).order_by(FinancialTerm.slug)).all()
    assert {term.name: term.example for term in terms} == EASY_EXPLANATIONS
    assert all(term.short_definition == f"공식 {term.name}" for term in terms)
    assert [term.is_reviewed for term in terms] == [int(term.slug[1:]) % 2 == 0 for term in terms]


def test_explanations_only_changes_nothing_when_a_term_is_missing(client: TestClient, capsys) -> None:
    factory = client.app.state.session_factory
    names = list(EASY_EXPLANATIONS)
    _add_terms(factory, names[1:])

    assert update_explanations(factory) == 1

    with factory() as session:
        assert set(session.scalars(select(FinancialTerm.example))) == {"예전 설명"}
    assert names[0] in capsys.readouterr().out


def test_explanations_have_no_dashes() -> None:
    assert not [name for name, text in EASY_EXPLANATIONS.items() if re.search("[—–]", text)]

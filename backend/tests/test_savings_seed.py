from decimal import Decimal

from fastapi.testclient import TestClient
from sqlalchemy import inspect

from app.repositories.savings_repository import SavingsRepository


def test_sqlite_contains_phase_two_product_tables(client: TestClient) -> None:
    tables = set(inspect(client.app.state.engine).get_table_names())

    assert {"savings_policies", "bank_savings_products", "preferential_conditions"} <= tables


def test_seed_contains_all_fourteen_official_products(client: TestClient) -> None:
    with client.app.state.session_factory() as session:
        repository = SavingsRepository(session)
        policy = repository.get_policy()
        products = repository.list_products()

    assert policy is not None
    assert policy.term_months == 36
    assert policy.maximum_monthly_amount == 500_000
    assert policy.general_contribution_rate == Decimal("6.00")
    assert policy.preferred_contribution_rate == Decimal("12.00")
    assert {product.bank_code for product in products} == {
        "nh", "shinhan", "woori", "hana", "ibk", "kb", "post",
        "sh", "im", "busan", "gwangju", "jeonbuk", "gyeongnam", "kakao",
    }
    assert all(product.source_url.startswith("https://") for product in products)
    assert all(
        sum((condition.bonus_rate for condition in product.conditions), Decimal("0"))
        >= product.maximum_bonus_rate
        for product in products
    )
    assert sum(product.maximum_bonus_rate == Decimal("3.00") for product in products) == 7
    assert sum(product.maximum_bonus_rate == Decimal("2.00") for product in products) == 7


def test_database_seed_is_idempotent(client: TestClient) -> None:
    from app.db.init_db import initialize_database

    initialize_database(client.app.state.session_factory)
    with client.app.state.session_factory() as session:
        products = SavingsRepository(session).list_products()

    assert len(products) == 14
    assert sum(len(product.conditions) for product in products) == 82

from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.auth_gateway import AuthCredentialsError, AuthUnavailableError

URL = "/api/v1/me/plans"
USERS = {"token-a": "user-a", "token-b": "user-b"}


class TwoUserGateway:
    def sign_up(self, email: str, password: str, display_name: str) -> dict[str, Any]:
        raise NotImplementedError

    def login(self, email: str, password: str) -> dict[str, Any]:
        raise NotImplementedError

    def get_user(self, access_token: str) -> dict[str, Any]:
        if access_token == "down":
            raise AuthUnavailableError("인증 서버에 연결하지 못했습니다.")
        if access_token not in USERS:
            raise AuthCredentialsError("로그인 상태를 확인해 주세요.")
        return {"id": USERS[access_token], "email": f"{USERS[access_token]}@example.com", "user_metadata": {}}


@pytest.fixture
def plans_client(tmp_path: Path) -> Iterator[TestClient]:
    app = create_app(database_url=f"sqlite:///{(tmp_path / 'plans.sqlite3').as_posix()}", auth_gateway=TwoUserGateway(), create_schema_for_tests=True)
    with TestClient(app) as client:
        yield client


def _auth(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


def _draft(amount: int = 500_000) -> dict[str, Any]:
    return {
        "version": 1,
        "plan": {"enrollmentStatus": "enrolled", "monthlyAmount": amount, "startMonth": "2026-07", "contributionType": "general", "currentBankCode": "kb"},
        "conditions": {"kb:salary": "yes", "kb:card": "unknown"},
        "monthlyPayments": {"0": 500_000, "1": 250_000},
    }


def test_a_user_saves_lists_overwrites_and_deletes_their_plans(plans_client: TestClient) -> None:
    created = plans_client.post(URL, json={"name": "  월 50만 원  계획 ", "draft": _draft()}, headers=_auth("token-a"))
    assert created.status_code == 201
    plan = created.json()
    assert plan["name"] == "월 50만 원 계획"
    assert plan["draft"] == _draft() | {"plan": _draft()["plan"] | {"transitionStatus": None}}

    listed = plans_client.get(URL, headers=_auth("token-a")).json()
    assert [item["id"] for item in listed["plans"]] == [plan["id"]] and listed["limit"] == 10

    updated = plans_client.put(f"{URL}/{plan['id']}", json={"name": "줄인 계획", "draft": _draft(300_000)}, headers=_auth("token-a")).json()
    assert updated["name"] == "줄인 계획" and updated["draft"]["plan"]["monthlyAmount"] == 300_000

    assert plans_client.delete(f"{URL}/{plan['id']}", headers=_auth("token-a")).status_code == 204
    assert plans_client.get(URL, headers=_auth("token-a")).json()["plans"] == []
    assert plans_client.delete(f"{URL}/{plan['id']}", headers=_auth("token-a")).status_code == 404


def test_one_user_can_never_see_or_change_another_users_plans(plans_client: TestClient) -> None:
    mine = plans_client.post(URL, json={"name": "A의 계획", "draft": _draft()}, headers=_auth("token-a")).json()

    assert plans_client.get(URL, headers=_auth("token-b")).json()["plans"] == []
    assert plans_client.put(f"{URL}/{mine['id']}", json={"name": "가로채기", "draft": _draft()}, headers=_auth("token-b")).status_code == 404
    assert plans_client.delete(f"{URL}/{mine['id']}", headers=_auth("token-b")).status_code == 404
    assert plans_client.delete(URL, headers=_auth("token-b")).status_code == 204  # B's "delete all" leaves A alone
    assert [plan["name"] for plan in plans_client.get(URL, headers=_auth("token-a")).json()["plans"]] == ["A의 계획"]

    assert plans_client.delete(URL, headers=_auth("token-a")).status_code == 204
    assert plans_client.get(URL, headers=_auth("token-a")).json()["plans"] == []


def test_plans_need_a_valid_login(plans_client: TestClient) -> None:
    assert plans_client.get(URL).status_code == 401
    assert plans_client.get(URL, headers=_auth("nobody")).status_code == 401
    assert plans_client.get(URL, headers={"Authorization": "Basic x"}).status_code == 401
    assert plans_client.get(URL, headers=_auth("down")).status_code == 503


def test_only_the_draft_shape_is_accepted_and_at_most_ten_plans(plans_client: TestClient) -> None:
    bad = [
        {"name": "", "draft": _draft()},
        {"name": "x" * 41, "draft": _draft()},
        {"name": "a", "draft": {**_draft(), "version": 2}},
        {"name": "a", "draft": {**_draft(), "conditions": {"kb:salary": "maybe"}}},
        {"name": "a", "draft": {**_draft(), "monthlyPayments": {"0": -1}}},
        {"name": "a", "draft": {**_draft(), "plan": {"startMonth": "2026-13"}}},
        {"name": "a", "draft": {**_draft(), "plan": {"currentBankCode": "<script>"}}},
    ]
    assert [plans_client.post(URL, json=payload, headers=_auth("token-a")).status_code for payload in bad] == [422] * len(bad)

    for number in range(10):
        assert plans_client.post(URL, json={"name": f"계획 {number}", "draft": _draft()}, headers=_auth("token-a")).status_code == 201
    full = plans_client.post(URL, json={"name": "11번째", "draft": _draft()}, headers=_auth("token-a"))
    assert full.status_code == 409 and "10개까지" in full.json()["error"]["message"]

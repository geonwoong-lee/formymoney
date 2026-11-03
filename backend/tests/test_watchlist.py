from tests.test_saved_plans import _auth, plans_client  # noqa: F401  (fixture reuse)

URL = "/api/v1/me/watchlist"


def _item(code: str, kind: str = "deposit", company: str = "카카오뱅크") -> dict[str, str]:
    return {"kind": kind, "company": company, "productCode": code, "productName": f"{code} 정기예금"}


def test_a_user_keeps_replaces_and_clears_their_starred_products(plans_client) -> None:  # noqa: F811
    assert plans_client.get(URL, headers=_auth("token-a")).json() == {"items": [], "updatedAt": None, "limit": 30}

    saved = plans_client.put(URL, headers=_auth("token-a"), json={"items": [_item("A"), _item("B", "saving"), _item("A")]})
    assert saved.status_code == 200
    assert [item["productCode"] for item in saved.json()["items"]] == ["A", "B"]  # the same product twice is kept once

    assert [item["productCode"] for item in plans_client.get(URL, headers=_auth("token-a")).json()["items"]] == ["A", "B"]
    plans_client.put(URL, headers=_auth("token-a"), json={"items": [_item("C")]})
    assert [item["productCode"] for item in plans_client.get(URL, headers=_auth("token-a")).json()["items"]] == ["C"]

    assert plans_client.delete(URL, headers=_auth("token-a")).status_code == 204
    assert plans_client.get(URL, headers=_auth("token-a")).json()["items"] == []


def test_lists_are_per_user_and_need_a_login(plans_client) -> None:  # noqa: F811
    plans_client.put(URL, headers=_auth("token-a"), json={"items": [_item("A")]})
    assert plans_client.get(URL, headers=_auth("token-b")).json()["items"] == []
    plans_client.put(URL, headers=_auth("token-b"), json={"items": [_item("B")]})
    assert [item["productCode"] for item in plans_client.get(URL, headers=_auth("token-a")).json()["items"]] == ["A"]
    assert plans_client.delete(URL, headers=_auth("token-b")).status_code == 204
    assert [item["productCode"] for item in plans_client.get(URL, headers=_auth("token-a")).json()["items"]] == ["A"]

    assert plans_client.get(URL).status_code == 401
    assert plans_client.put(URL, json={"items": []}).status_code == 401
    assert plans_client.get(URL, headers=_auth("nobody")).status_code == 401
    assert plans_client.get(URL, headers=_auth("down")).status_code == 503


def test_only_the_expected_shape_and_size_are_accepted(plans_client) -> None:  # noqa: F811
    put = lambda items: plans_client.put(URL, headers=_auth("token-a"), json={"items": items})  # noqa: E731
    assert put([{**_item("A"), "kind": "bond"}]).status_code == 422
    extra = put([{**_item("A"), "extra": "x"}])  # unknown keys are dropped, never stored
    assert extra.status_code == 200 and "extra" not in extra.json()["items"][0]
    assert put([{"kind": "deposit", "company": "", "productCode": "A", "productName": "x"}]).status_code == 422
    assert put([_item(f"P{index}") for index in range(31)]).status_code == 422
    assert put([_item(f"P{index}") for index in range(30)]).status_code == 200

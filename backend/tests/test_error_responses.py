from fastapi.testclient import TestClient


def _assert_common_error(response, status: int, code: str) -> dict:
    assert response.status_code == status
    body = response.json()
    assert set(body) == {"error"}
    assert body["error"]["code"] == code
    assert isinstance(body["error"]["message"], str) and body["error"]["message"]
    return body["error"]


def test_unknown_route_uses_common_error_format(client: TestClient) -> None:
    error = _assert_common_error(client.get("/api/v1/nothing"), 404, "http_error")

    assert "Not Found" not in error["message"]


def test_wrong_method_uses_common_error_format(client: TestClient) -> None:
    _assert_common_error(client.delete("/api/v1/health"), 405, "http_error")


def test_invalid_input_uses_common_error_format(client: TestClient) -> None:
    _assert_common_error(client.post("/api/v1/savings/calculate", json={}), 422, "validation_error")


def test_explicit_http_error_keeps_its_message(client: TestClient) -> None:
    error = _assert_common_error(client.get("/api/v1/auth/me"), 401, "http_error")

    assert error["message"] == "로그인이 필요합니다."


def test_unexpected_exception_hides_internal_details(client: TestClient) -> None:
    def explode() -> None:
        raise RuntimeError("secret-internal-detail")

    client.app.add_api_route("/api/v1/_boom", explode)
    safe_client = TestClient(client.app, raise_server_exceptions=False)

    response = safe_client.get("/api/v1/_boom")

    error = _assert_common_error(response, 500, "internal_error")
    assert "secret-internal-detail" not in response.text
    assert "RuntimeError" not in response.text
    assert "다시 시도" in error["message"]


def test_server_error_is_readable_by_allowed_origin_only(client: TestClient) -> None:
    def explode() -> None:
        raise RuntimeError("boom")

    client.app.add_api_route("/api/v1/_boom2", explode)
    safe_client = TestClient(client.app, raise_server_exceptions=False)
    allowed = client.app.state.settings.allowed_origins[0]

    ok = safe_client.get("/api/v1/_boom2", headers={"Origin": allowed})
    other = safe_client.get("/api/v1/_boom2", headers={"Origin": "https://evil.example"})

    assert ok.headers.get("access-control-allow-origin") == allowed
    assert "access-control-allow-origin" not in other.headers

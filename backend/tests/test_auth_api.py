from collections.abc import Iterator
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import create_app
from app.services.auth_gateway import AuthConflictError, AuthCredentialsError


class FakeAuthGateway:
    def sign_up(self, email: str, password: str, display_name: str) -> dict[str, Any]:
        del password
        if email == "existing@example.com":
            raise AuthConflictError("이미 가입된 이메일입니다.")
        if email == "confirm@example.com":
            # 이메일 확인이 켜진 Supabase는 user 래핑 없이 사용자 정보를 최상위로 반환한다.
            return {
                "id": "user-2",
                "email": email,
                "created_at": "2026-10-28T00:00:00Z",
                "user_metadata": {"display_name": display_name},
            }
        return {
            "user": {
                "id": "user-1",
                "email": email,
                "created_at": "2026-10-28T00:00:00Z",
                "user_metadata": {"display_name": display_name},
            }
        }

    def login(self, email: str, password: str) -> dict[str, Any]:
        if password == "wrong-password":
            raise AuthCredentialsError("이메일 또는 비밀번호를 확인해 주세요.")
        return {
            "access_token": "test-access-token",
            "refresh_token": "test-refresh-token",
            "expires_in": 3600,
            "token_type": "bearer",
            "user": {
                "id": "user-1",
                "email": email,
                "created_at": "2026-10-28T00:00:00Z",
                "user_metadata": {"display_name": "테스트 사용자"},
            },
        }

    def get_user(self, access_token: str) -> dict[str, Any]:
        if access_token != "test-access-token":
            raise AuthCredentialsError("로그인 상태를 확인해 주세요.")
        return {
            "id": "user-1",
            "email": "user@example.com",
            "created_at": "2026-10-28T00:00:00Z",
            "user_metadata": {"display_name": "테스트 사용자"},
        }


@pytest.fixture
def auth_client(tmp_path: Path) -> Iterator[TestClient]:
    database_url = f"sqlite:///{(tmp_path / 'auth.sqlite3').as_posix()}"
    app = create_app(
        database_url=database_url,
        auth_gateway=FakeAuthGateway(),
        create_schema_for_tests=True,
    )
    with TestClient(app) as test_client:
        yield test_client


def test_signup_returns_201_and_never_returns_password(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/v1/auth/signup",
        json={"email": "USER@example.com", "password": "safe-password", "displayName": "사용자"},
    )

    assert response.status_code == 201
    assert response.json()["user"]["email"] == "user@example.com"
    assert response.json()["needsEmailConfirmation"] is True
    assert "password" not in response.text


def test_signup_accepts_top_level_user_when_email_confirmation_is_required(auth_client: TestClient) -> None:
    response = auth_client.post(
        "/api/v1/auth/signup",
        json={"email": "confirm@example.com", "password": "safe-password", "displayName": "사용자"},
    )

    assert response.status_code == 201
    assert response.json()["user"]["email"] == "confirm@example.com"
    assert response.json()["needsEmailConfirmation"] is True
    assert response.json()["accessToken"] is None


def test_gateway_rate_limit_becomes_429_with_clear_message(
    auth_client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from urllib.error import HTTPError

    from app.services.auth_gateway import SupabaseAuthGateway

    def raise_429(*args: Any, **kwargs: Any) -> None:
        raise HTTPError("https://example.test", 429, "Too Many Requests", {}, None)

    monkeypatch.setattr("app.services.auth_gateway.urlopen", raise_429)
    auth_client.app.state.auth_gateway = SupabaseAuthGateway("https://example.test", "anon")

    response = auth_client.post(
        "/api/v1/auth/signup",
        json={"email": "limit@example.com", "password": "safe-password", "displayName": "사용자"},
    )

    assert response.status_code == 429
    assert "잠시 후 다시 시도" in response.json()["error"]["message"]


def test_signup_validates_input_and_reports_conflict(auth_client: TestClient) -> None:
    invalid = auth_client.post(
        "/api/v1/auth/signup",
        json={"email": "not-email", "password": "short", "displayName": ""},
    )
    conflict = auth_client.post(
        "/api/v1/auth/signup",
        json={"email": "existing@example.com", "password": "safe-password", "displayName": "사용자"},
    )

    assert invalid.status_code == 422
    assert conflict.status_code == 409


def test_login_returns_session_and_invalid_credentials_return_401(auth_client: TestClient) -> None:
    success = auth_client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "safe-password"},
    )
    failure = auth_client.post(
        "/api/v1/auth/login",
        json={"email": "user@example.com", "password": "wrong-password"},
    )

    assert success.status_code == 200
    assert success.json()["accessToken"] == "test-access-token"
    assert failure.status_code == 401


def test_me_requires_valid_bearer_token(auth_client: TestClient) -> None:
    missing = auth_client.get("/api/v1/auth/me")
    invalid = auth_client.get("/api/v1/auth/me", headers={"Authorization": "Bearer invalid"})
    success = auth_client.get(
        "/api/v1/auth/me",
        headers={"Authorization": "Bearer test-access-token"},
    )

    assert missing.status_code == 401
    assert invalid.status_code == 401
    assert success.status_code == 200
    assert success.json()["displayName"] == "테스트 사용자"


def test_frontend_can_send_authorization_header(auth_client: TestClient) -> None:
    response = auth_client.options(
        "/api/v1/auth/me",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
            "Access-Control-Request-Headers": "Authorization",
        },
    )

    assert response.status_code == 200
    assert "Authorization" in response.headers["access-control-allow-headers"]

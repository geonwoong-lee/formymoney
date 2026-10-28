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

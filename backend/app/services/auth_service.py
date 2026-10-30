from datetime import datetime
from typing import Any

from app.schemas.auth import AuthSessionResponse, UserResponse
from app.services.auth_gateway import AuthGateway, AuthGatewayError


class AuthResponseError(AuthGatewayError):
    pass


class AuthService:
    def __init__(self, gateway: AuthGateway) -> None:
        self.gateway = gateway

    def sign_up(self, email: str, password: str, display_name: str) -> AuthSessionResponse:
        data = self.gateway.sign_up(email, password, display_name)
        user_data = data.get("user")
        if not isinstance(user_data, dict) and "id" in data and "email" in data:
            # 이메일 확인이 켜져 있으면 Supabase는 세션 없이 사용자 정보를 최상위로 돌려준다.
            user_data = data
        if not isinstance(user_data, dict):
            raise AuthResponseError("회원 정보를 확인하지 못했습니다.")
        return self._session_response(data, user_data)

    def login(self, email: str, password: str) -> AuthSessionResponse:
        data = self.gateway.login(email, password)
        user_data = data.get("user")
        if not isinstance(user_data, dict) or not isinstance(data.get("access_token"), str):
            raise AuthResponseError("로그인 응답을 확인하지 못했습니다.")
        return self._session_response(data, user_data)

    def get_user(self, access_token: str) -> UserResponse:
        return self._user_response(self.gateway.get_user(access_token))

    def _session_response(self, data: dict[str, Any], user_data: dict[str, Any]) -> AuthSessionResponse:
        access_token = data.get("access_token")
        return AuthSessionResponse(
            user=self._user_response(user_data),
            access_token=access_token if isinstance(access_token, str) else None,
            refresh_token=data.get("refresh_token") if isinstance(data.get("refresh_token"), str) else None,
            expires_in=data.get("expires_in") if isinstance(data.get("expires_in"), int) else None,
            token_type=str(data.get("token_type", "bearer")),
            needs_email_confirmation=not isinstance(access_token, str),
        )

    @staticmethod
    def _user_response(data: dict[str, Any]) -> UserResponse:
        user_id = data.get("id")
        email = data.get("email")
        if not isinstance(user_id, str) or not isinstance(email, str):
            raise AuthResponseError("회원 정보를 확인하지 못했습니다.")
        metadata = data.get("user_metadata")
        display_name = metadata.get("display_name") if isinstance(metadata, dict) else None
        created_at = data.get("created_at")
        return UserResponse(
            id=user_id,
            email=email,
            display_name=display_name if isinstance(display_name, str) else None,
            created_at=datetime.fromisoformat(created_at.replace("Z", "+00:00")) if isinstance(created_at, str) else None,
        )

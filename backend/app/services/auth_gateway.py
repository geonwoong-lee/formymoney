import json
from typing import Any, Protocol
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


class AuthGatewayError(RuntimeError):
    pass


class AuthConfigurationError(AuthGatewayError):
    pass


class AuthCredentialsError(AuthGatewayError):
    pass


class AuthConflictError(AuthGatewayError):
    pass


class AuthUnavailableError(AuthGatewayError):
    pass


class AuthGateway(Protocol):
    def sign_up(self, email: str, password: str, display_name: str) -> dict[str, Any]: ...

    def login(self, email: str, password: str) -> dict[str, Any]: ...

    def get_user(self, access_token: str) -> dict[str, Any]: ...


class SupabaseAuthGateway:
    def __init__(self, url: str | None, anon_key: str | None) -> None:
        self.url = url.rstrip("/") if url else None
        self.anon_key = anon_key

    def sign_up(self, email: str, password: str, display_name: str) -> dict[str, Any]:
        return self._request(
            "POST",
            "/auth/v1/signup",
            {"email": email, "password": password, "data": {"display_name": display_name}},
            conflict_on_400=True,
        )

    def login(self, email: str, password: str) -> dict[str, Any]:
        query = urlencode({"grant_type": "password"})
        return self._request("POST", f"/auth/v1/token?{query}", {"email": email, "password": password})

    def get_user(self, access_token: str) -> dict[str, Any]:
        return self._request("GET", "/auth/v1/user", access_token=access_token)

    def _request(
        self,
        method: str,
        path: str,
        payload: dict[str, Any] | None = None,
        access_token: str | None = None,
        conflict_on_400: bool = False,
    ) -> dict[str, Any]:
        if not self.url or not self.anon_key:
            raise AuthConfigurationError("Supabase 인증 환경변수가 설정되지 않았습니다.")

        headers = {"apikey": self.anon_key, "Content-Type": "application/json"}
        if access_token:
            headers["Authorization"] = f"Bearer {access_token}"
        body = json.dumps(payload).encode("utf-8") if payload is not None else None
        request = Request(f"{self.url}{path}", data=body, headers=headers, method=method)

        try:
            with urlopen(request, timeout=10) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            if conflict_on_400 and error.code in {400, 422}:
                raise AuthConflictError("이미 가입된 이메일이거나 가입할 수 없는 주소입니다.") from error
            if error.code in {400, 401, 403, 422}:
                raise AuthCredentialsError("이메일, 비밀번호 또는 로그인 상태를 확인해 주세요.") from error
            raise AuthUnavailableError("인증 서비스를 이용할 수 없습니다.") from error
        except (URLError, TimeoutError, json.JSONDecodeError) as error:
            raise AuthUnavailableError("인증 서비스에 연결할 수 없습니다.") from error

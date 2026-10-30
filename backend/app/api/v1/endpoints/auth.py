from fastapi import APIRouter, Header, HTTPException, Request, status

from app.schemas.auth import AuthSessionResponse, LoginRequest, SignUpRequest, UserResponse
from app.services.auth_gateway import (
    AuthConfigurationError,
    AuthConflictError,
    AuthCredentialsError,
    AuthRateLimitError,
    AuthUnavailableError,
)
from app.services.auth_service import AuthResponseError, AuthService


router = APIRouter(prefix="/auth")


@router.post("/signup", response_model=AuthSessionResponse, status_code=status.HTTP_201_CREATED)
def sign_up(payload: SignUpRequest, request: Request) -> AuthSessionResponse:
    try:
        return AuthService(request.app.state.auth_gateway).sign_up(
            payload.email,
            payload.password,
            payload.display_name,
        )
    except AuthConflictError as error:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(error)) from error
    except AuthRateLimitError as error:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(error)) from error
    except AuthConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except (AuthUnavailableError, AuthResponseError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.post("/login", response_model=AuthSessionResponse)
def login(payload: LoginRequest, request: Request) -> AuthSessionResponse:
    try:
        return AuthService(request.app.state.auth_gateway).login(payload.email, payload.password)
    except AuthCredentialsError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
    except AuthRateLimitError as error:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(error)) from error
    except AuthConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except (AuthUnavailableError, AuthResponseError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


@router.get("/me", response_model=UserResponse)
def get_me(request: Request, authorization: str | None = Header(default=None)) -> UserResponse:
    access_token = _bearer_token(authorization)
    try:
        return AuthService(request.app.state.auth_gateway).get_user(access_token)
    except AuthCredentialsError as error:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(error)) from error
    except AuthRateLimitError as error:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=str(error)) from error
    except AuthConfigurationError as error:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(error)) from error
    except (AuthUnavailableError, AuthResponseError) as error:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=str(error)) from error


def _bearer_token(authorization: str | None) -> str:
    if authorization is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인이 필요합니다.")
    scheme, separator, token = authorization.partition(" ")
    if separator == "" or scheme.lower() != "bearer" or not token.strip():
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="로그인 정보를 확인해 주세요.")
    return token.strip()

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.schemas.health import to_camel


class AuthModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class SignUpRequest(AuthModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)
    display_name: str = Field(min_length=1, max_length=50)

    @field_validator("email")
    @classmethod
    def validate_email(cls, value: str) -> str:
        normalized = value.strip().lower()
        if "@" not in normalized or normalized.startswith("@") or normalized.endswith("@"):
            raise ValueError("올바른 이메일 주소를 입력해 주세요.")
        return normalized

    @field_validator("display_name")
    @classmethod
    def normalize_display_name(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("표시 이름을 입력해 주세요.")
        return normalized


class LoginRequest(AuthModel):
    email: str = Field(min_length=3, max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserResponse(AuthModel):
    id: str
    email: str
    display_name: str | None = None
    created_at: datetime | None = None


class AuthSessionResponse(AuthModel):
    user: UserResponse
    access_token: str | None = None
    refresh_token: str | None = None
    expires_in: int | None = None
    token_type: str = "bearer"
    needs_email_confirmation: bool = False

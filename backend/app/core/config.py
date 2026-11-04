from functools import lru_cache
from pathlib import Path

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    app_name: str = "Very Rich?"
    api_v1_prefix: str = "/api/v1"
    database_url: str | None = None
    frontend_origins: str = "http://localhost:5173"
    supabase_url: str | None = None
    supabase_anon_key: str | None = None
    n8n_ingest_secret: str | None = None
    naver_client_id: str | None = None
    naver_client_secret: str | None = None
    naver_hub_key_id: str | None = None
    naver_hub_key: str | None = None
    openai_api_key: str | None = None
    openai_model: str | None = None
    ecos_api_key: str | None = None
    finlife_api_key: str | None = None  # 금융감독원 금융상품 한눈에 Open API
    # 금융감독원 전자공시(OpenDART). Read from VERY_RICH_DART_API_KEY or the plain DART_API_KEY name.
    dart_api_key: str | None = Field(default=None, validation_alias=AliasChoices("VERY_RICH_DART_API_KEY", "DART_API_KEY"))
    youth_api_key: str | None = None  # 온통청년 청년정책 Open API (한국고용정보원)
    daily_token_limit: int = 200_000

    model_config = SettingsConfigDict(
        env_file=BACKEND_DIR / ".env",
        env_prefix="VERY_RICH_",
        extra="ignore",
    )

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.frontend_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()

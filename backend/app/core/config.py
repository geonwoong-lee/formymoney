from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


BACKEND_DIR = Path(__file__).resolve().parents[2]
DEFAULT_DATABASE_PATH = (BACKEND_DIR / "data" / "very_rich.sqlite3").as_posix()


class Settings(BaseSettings):
    app_name: str = "Very Rich?"
    api_v1_prefix: str = "/api/v1"
    database_url: str = f"sqlite:///{DEFAULT_DATABASE_PATH}"
    frontend_origins: str = "http://localhost:5173"
    supabase_url: str | None = None
    supabase_anon_key: str | None = None

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

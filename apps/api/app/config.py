from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@db:5432/pt_adherence"
    SECRET_KEY: str = "change-me-in-production"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60  # 1 hour; use refresh for longer sessions
    CORS_ORIGINS: list[str] = ["http://localhost:8081", "exp://localhost:8081"]

    # Persistence backend: "memory" (default) or "json"
    STORE_BACKEND: str = "memory"
    STORE_FILE: str = "/tmp/pt-atlas-data.json"


settings = Settings()

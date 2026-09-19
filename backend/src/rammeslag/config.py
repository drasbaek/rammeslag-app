"""Application settings, read from the environment.

Everything that differs between local development, preview and production
lives here and nowhere else.
"""

from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Environment-driven configuration.

    Field names map to upper-case environment variables, so ``database_url``
    reads ``DATABASE_URL`` -- which is what Neon and Vercel already provide.
    """

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # Empty by default so the app can be imported (and unit-tested) without a
    # database. Anything that actually opens a connection raises if it is unset.
    database_url: str = ""

    # Signing key for the session cookie. Must be overridden in production.
    session_secret: str = "dev-only-insecure-secret"
    cookie_name: str = "rammeslag_session"
    cookie_secure: bool = True
    cookie_samesite: str = "lax"
    session_max_age_days: int = 90

    # "production" | "development". Only affects cookie flags and CORS.
    environment: str = "production"
    cors_origins: list[str] = []

    @property
    def session_max_age_seconds(self) -> int:
        return self.session_max_age_days * 24 * 60 * 60

    @property
    def is_development(self) -> bool:
        return self.environment.lower().startswith("dev")


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    return Settings()


def reset_settings_cache() -> None:
    """Drop the cached Settings. Used by tests that patch the environment."""
    get_settings.cache_clear()

"""Settings from env vars via pydantic BaseSettings.

Railway sets PORT automatically. All other settings can be configured
via Railway's environment variables dashboard.
"""

from __future__ import annotations

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Server — Railway sets PORT automatically
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False

    # CORS — add your deployed frontend URL here
    allowed_origins: str = "http://localhost:3000,http://localhost:5173"

    # Data refresh intervals (seconds)
    price_refresh_interval: int = 60
    full_refresh_interval: int = 300
    depth_refresh_interval: int = 3600

    # Kalshi
    kalshi_base_url: str = "https://api.elections.kalshi.com/trade-api/v2"

    # Polymarket
    poly_gamma_url: str = "https://gamma-api.polymarket.com"
    poly_clob_url: str = "https://clob.polymarket.com"

    # Database path — set to /data/oddssync.db with a Railway volume for persistence
    db_path: str = "oddssync.db"

    # Rate limiting
    rate_limit: str = "60/minute"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]


settings = Settings()

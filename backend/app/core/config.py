import json
import logging
from typing import Any

from pydantic import field_validator
from pydantic_settings import BaseSettings, EnvSettingsSource, SettingsConfigDict

logger = logging.getLogger(__name__)

_DEFAULT_CORS = ["http://localhost:80", "http://localhost:4200"]


class _SafeEnvSettingsSource(EnvSettingsSource):
    """EnvSettingsSource that catches JSON decode errors for complex fields."""

    def prepare_field_value(
        self, field_name: str, field: Any, field_value: Any, value_is_complex: bool
    ) -> Any:
        try:
            return super().prepare_field_value(field_name, field, field_value, value_is_complex)
        except Exception:
            if isinstance(field_value, str) and field_value.strip():
                logger.warning(
                    "Could not parse env var %s=%r, falling back to default",
                    field_name, field_value,
                )
            return field_value


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    # Database
    postgres_user: str = "crm_user"
    postgres_password: str = "crm_pass"
    postgres_db: str = "crm_db"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    # JWT
    jwt_secret_key: str = "change-me-to-a-random-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_token_expire_minutes: int = 60
    jwt_refresh_token_expire_days: int = 7

    # SMS / Twilio
    sms_provider: str = "logging"
    twilio_account_sid: str = ""
    twilio_auth_token: str = ""
    twilio_phone_number: str = ""

    # Receipt download base URL
    receipt_base_url: str = "http://localhost:80"

    # App URL for SMS links
    app_url: str = "http://localhost:80"

    # Security
    cors_origins: list[str] = _DEFAULT_CORS

    # App
    app_name: str = "Driving School CRM"
    debug: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _parse_cors_origins(cls, v):
        if isinstance(v, str):
            v = v.strip()
            if not v:
                return _DEFAULT_CORS
            try:
                parsed = json.loads(v)
                if isinstance(parsed, list):
                    return parsed
            except (json.JSONDecodeError, ValueError):
                return [o.strip() for o in v.split(",") if o.strip()] or _DEFAULT_CORS
        return v

    @classmethod
    def settings_customise_sources(cls, settings_cls, init_settings, env_settings, dotenv_settings, file_secret_settings):
        return (
            init_settings,
            _SafeEnvSettingsSource(settings_cls),
            dotenv_settings,
            file_secret_settings,
        )

    @property
    def database_url(self) -> str:
        return (
            f"postgresql+asyncpg://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def database_url_sync(self) -> str:
        return (
            f"postgresql+psycopg2://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()

from __future__ import annotations

from pydantic import model_validator
from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    database_url: str = "postgresql+asyncpg://minigrid:minigrid_dev@db:5432/minigrid"
    document_storage_path: str = "/app/documents"

    @model_validator(mode="after")
    def fix_database_url(self):
        if self.database_url.startswith("postgres://"):
            self.database_url = self.database_url.replace("postgres://", "postgresql+asyncpg://", 1)
        elif self.database_url.startswith("postgresql://"):
            self.database_url = self.database_url.replace("postgresql://", "postgresql+asyncpg://", 1)
        return self
    clerk_secret_key: str = ""
    clerk_jwks_url: str = "https://api.clerk.com/v1/jwks"
    clerk_issuer: str = ""
    r2_endpoint_url: str = ""
    r2_access_key_id: str = ""
    r2_secret_access_key: str = ""
    r2_bucket_name: str = "minigrid-documents"
    cors_origins: list[str] = ["http://localhost:3000"]
    environment: str = "development"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

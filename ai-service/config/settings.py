from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "ai-service"
    app_version: str = "1.0.0"
    environment: str = "development"

    api_key: str | None = None
    request_timeout_seconds: float = 2.5
    llm_base_url: str = "http://localhost:8000/v1"
    llm_model: str = "Qwen/Qwen3-8B-Instruct"
    qdrant_host: str = "localhost"
    qdrant_port: int = 6333
    qdrant_collection: str = "sap_documents"
    embedding_model: str = "BAAI/bge-m3"
    top_k: int = 3
    max_context_chars: int = 3500


@lru_cache
def get_settings() -> Settings:
    return Settings()

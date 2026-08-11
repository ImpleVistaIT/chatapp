from __future__ import annotations

from qdrant_client import QdrantClient

from config.settings import get_settings


settings = get_settings()


def get_qdrant_client() -> QdrantClient:
    return QdrantClient(host=settings.qdrant_host, port=settings.qdrant_port)

from __future__ import annotations

from typing import Any

from config.settings import get_settings
from rag.embeddings import embed_text
from vector_db.qdrant_client import get_qdrant_client


settings = get_settings()


class RetrieverUnavailableError(RuntimeError):
    pass


def retrieve_documents(query: str, top_k: int | None = None) -> list[dict[str, Any]]:
    try:
        client = get_qdrant_client()
        result = client.search(
            collection_name=settings.qdrant_collection,
            query_vector=embed_text(query),
            limit=top_k or settings.top_k,
            with_payload=True,
            with_vectors=False,
        )
        return [hit.payload or {} for hit in result]
    except Exception as exc:  # pragma: no cover - external dependency failure
        raise RetrieverUnavailableError(str(exc)) from exc

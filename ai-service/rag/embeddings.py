from __future__ import annotations

from functools import lru_cache

from sentence_transformers import SentenceTransformer

from config.settings import get_settings


settings = get_settings()


@lru_cache
def get_embedding_model() -> SentenceTransformer:
    return SentenceTransformer(settings.embedding_model)


def embed_text(text: str) -> list[float]:
    model = get_embedding_model()
    vector = model.encode([text], normalize_embeddings=True)[0]
    return vector.tolist()

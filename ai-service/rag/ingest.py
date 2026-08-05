from __future__ import annotations

from pathlib import Path
from uuid import uuid4

from pypdf import PdfReader
from qdrant_client.http import models

from config.settings import get_settings
from rag.embeddings import embed_text
from vector_db.qdrant_client import get_qdrant_client


settings = get_settings()


def extract_text_from_pdf(file_path: Path) -> str:
    reader = PdfReader(str(file_path))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def chunk_text(text: str, max_chars: int = 900) -> list[str]:
    chunks = []
    current = []
    current_length = 0
    for paragraph in text.splitlines():
        paragraph = paragraph.strip()
        if not paragraph:
            continue
        if current_length + len(paragraph) + 1 > max_chars and current:
            chunks.append(" ".join(current))
            current = []
            current_length = 0
        current.append(paragraph)
        current_length += len(paragraph) + 1
    if current:
        chunks.append(" ".join(current))
    return chunks or [text[:max_chars]]


def ensure_collection() -> None:
    client = get_qdrant_client()
    collections = {collection.name for collection in client.get_collections().collections}
    if settings.qdrant_collection not in collections:
        client.create_collection(
            collection_name=settings.qdrant_collection,
            vectors_config=models.VectorParams(size=1024, distance=models.Distance.COSINE),
        )


def ingest_document(file_path: Path) -> int:
    ensure_collection()
    text = extract_text_from_pdf(file_path)
    chunks = chunk_text(text)
    client = get_qdrant_client()
    points = []
    for index, chunk in enumerate(chunks):
        points.append(
            models.PointStruct(
                id=str(uuid4()),
                vector=embed_text(chunk),
                payload={"text": chunk, "source": file_path.name, "chunk": index},
            )
        )
    client.upsert(collection_name=settings.qdrant_collection, points=points)
    return len(points)


def ingest_documents(document_dir: str = "documents") -> dict[str, int]:
    directory = Path(document_dir)
    total = 0
    for file_path in directory.glob("*.pdf"):
        total += ingest_document(file_path)
    return {"ingested_chunks": total}

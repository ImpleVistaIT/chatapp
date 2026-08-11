# AI Service

Production-oriented FastAPI microservice for SAP intent detection, entity extraction, RAG, and SAP tool orchestration.

## Endpoints

- `POST /chat`
- `POST /ingest`
- `GET /health`

## Example

```json
{
  "userId": "EMP001",
  "message": "Show PO 6000123456"
}
```

## Run locally

```bash
pip install -r requirements.txt
uvicorn app:app --host 0.0.0.0 --port 9000
```

## Docker

```bash
docker compose up --build
```

## Notes

- The SAP tool layer is mocked and ready to be replaced by Spring Boot or SAP backend APIs.
- RAG uses Qdrant and `BAAI/bge-m3` embeddings.
- The LLM client is OpenAI-compatible and targets vLLM at `http://localhost:8000/v1`.

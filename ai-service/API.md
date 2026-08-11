# API Documentation

## POST /chat

Classifies user intent, extracts SAP entities, and decides whether to call SAP tools, RAG, or both.

### Request

```json
{
  "userId": "EMP001",
  "message": "Show PO 6000123456"
}
```

### Response

```json
{
  "intent": "GET_PO_STATUS",
  "entities": { "po_number": "6000123456" },
  "backend": "S4HANA",
  "requires_rag": false,
  "requires_api": true,
  "tool": "get_po_status",
  "parameters": { "po": "6000123456" },
  "clarification": null,
  "answer": "{\"po\": \"6000123456\", \"status\": \"Approved\", \"vendor\": \"ABC Company\"}"
}
```

## POST /ingest

Loads PDF documents from `documents/` into Qdrant.

## GET /health

Returns service health status.

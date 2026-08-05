from __future__ import annotations

import json
import re
from typing import Any

from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

from config.settings import Settings, get_settings
from llm.model import LLMUnavailableError, create_answer
from rag.retriever import RetrieverUnavailableError, retrieve_documents
from rules.engine import resolve_document_backend
from tools.sap_tools import get_invoice_status, get_po_status, get_vendor_details


router = APIRouter()


class ChatRequest(BaseModel):
    userId: str = Field(..., min_length=1)
    message: str = Field(..., min_length=1)


class IngestResponse(BaseModel):
    ingested_chunks: int


class ChatResponse(BaseModel):
    intent: str
    entities: dict[str, Any] = Field(default_factory=dict)
    backend: str | None = None
    requires_rag: bool = False
    requires_api: bool = False
    tool: str | None = None
    parameters: dict[str, Any] = Field(default_factory=dict)
    clarification: str | None = None
    answer: str | None = None


def _rule_based_classification(message: str) -> dict[str, Any]:
    normalized = message.lower().strip()
    po_match = re.search(r"\b(?:po|purchase order|order)\s*(\d{10})\b", normalized)
    invoice_match = re.search(r"\b(?:invoice)\s*(\d{10})\b", normalized)
    vendor_match = re.search(r"\b(?:vendor|supplier)\s*([a-z0-9-]+)\b", normalized)

    if "approval process" in normalized or "policy" in normalized:
        return {"intent": "POLICY_QUERY", "requires_rag": True, "requires_api": False}
    if po_match:
        return {
            "intent": "GET_PO_STATUS",
            "entities": {"po_number": po_match.group(1)},
            "requires_api": True,
            "tool": "get_po_status",
            "parameters": {"po": po_match.group(1)},
        }
    if invoice_match:
        return {
            "intent": "GET_INVOICE_STATUS",
            "entities": {"invoice_number": invoice_match.group(1)},
            "requires_api": True,
            "tool": "get_invoice_status",
            "parameters": {"invoice": invoice_match.group(1)},
        }
    if vendor_match:
        return {
            "intent": "GET_VENDOR_DETAILS",
            "entities": {"vendor_id": vendor_match.group(1)},
            "requires_api": True,
            "tool": "get_vendor_details",
            "parameters": {"vendor_id": vendor_match.group(1)},
        }
    if "blocked" in normalized or "stuck" in normalized or "pending" in normalized:
        return {"intent": "GET_PO_STATUS", "requires_api": True, "requires_rag": True}
    if "order" in normalized and "po" not in normalized and "invoice" not in normalized:
        return {"intent": "CLARIFICATION", "clarification": "Please confirm whether you mean Purchase Order or Sales Order."}
    return {"intent": "UNKNOWN", "clarification": "Please provide a purchase order, invoice, vendor, or policy question."}


def _apply_business_rules(document_number: str | None) -> dict[str, str] | None:
    if not document_number:
        return None
    return resolve_document_backend(document_number)


def _select_tool(intent: str, entities: dict[str, Any]) -> tuple[str | None, dict[str, Any]]:
    if intent == "GET_PO_STATUS" and entities.get("po_number"):
        return "get_po_status", {"po": entities["po_number"]}
    if intent == "GET_INVOICE_STATUS" and entities.get("invoice_number"):
        return "get_invoice_status", {"invoice": entities["invoice_number"]}
    if intent == "GET_VENDOR_DETAILS" and entities.get("vendor_id"):
        return "get_vendor_details", {"vendor_id": entities["vendor_id"]}
    return None, {}


@router.post("/chat", response_model=ChatResponse)
async def chat(request: ChatRequest, authorization: str | None = Header(default=None), settings: Settings = Depends(get_settings)) -> ChatResponse:
    if settings.api_key and authorization != f"Bearer {settings.api_key}":
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")

    classified = _rule_based_classification(request.message)
    if classified["intent"] in {"CLARIFICATION", "UNKNOWN"}:
        return ChatResponse(**classified)

    entities = classified.get("entities", {})
    backend_info = _apply_business_rules(entities.get("po_number") or entities.get("invoice_number") or entities.get("delivery_number"))
    tool, parameters = _select_tool(classified["intent"], entities)

    requires_rag = bool(classified.get("requires_rag")) or classified["intent"] == "POLICY_QUERY" or "blocked" in request.message.lower()
    requires_api = bool(classified.get("requires_api")) or tool is not None
    answer = None

    if requires_api and tool:
        if tool == "get_po_status":
            api_result = get_po_status(parameters["po"])
        elif tool == "get_invoice_status":
            api_result = get_invoice_status(parameters["invoice"])
        else:
            api_result = get_vendor_details(parameters["vendor_id"])
        if requires_rag:
            try:
                context = retrieve_documents(request.message)
            except RetrieverUnavailableError:
                context = []
            try:
                answer = await create_answer(request.message, json.dumps({"api": api_result, "rag": context}))
            except LLMUnavailableError:
                answer = json.dumps({"api": api_result, "rag": context})
        else:
            answer = json.dumps(api_result)

    if requires_rag and not answer:
        try:
            context = retrieve_documents(request.message)
        except RetrieverUnavailableError:
            raise HTTPException(status_code=503, detail="RAG unavailable")
        try:
            answer = await create_answer(request.message, json.dumps(context))
        except LLMUnavailableError:
            answer = json.dumps({"context": context})

    if not answer:
        answer = classified.get("clarification")

    return ChatResponse(
        intent=classified.get("intent", "UNKNOWN"),
        entities=entities,
        backend=backend_info["backend"] if backend_info else classified.get("backend"),
        requires_rag=requires_rag,
        requires_api=requires_api,
        tool=tool,
        parameters=parameters,
        clarification=classified.get("clarification"),
        answer=answer,
    )


@router.post("/ingest", response_model=IngestResponse)
async def ingest_documents_endpoint() -> IngestResponse:
    from rag.ingest import ingest_documents

    result = ingest_documents()
    return IngestResponse(**result)

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app import app


@pytest.mark.asyncio
async def test_show_po_6000123456():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"userId": "EMP001", "message": "Show PO 6000123456"})
    body = response.json()
    assert response.status_code == 200
    assert body["intent"] == "GET_PO_STATUS"
    assert body["backend"] == "S4HANA"


@pytest.mark.asyncio
async def test_where_my_po_pending():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"userId": "EMP001", "message": "where my po pending"})
    assert response.status_code == 200
    assert response.json()["intent"] == "GET_PO_STATUS"


@pytest.mark.asyncio
async def test_check_order_clarification():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"userId": "EMP001", "message": "check order"})
    body = response.json()
    assert response.status_code == 200
    assert body["intent"] == "CLARIFICATION"


@pytest.mark.asyncio
async def test_po_approval_process_uses_rag():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"userId": "EMP001", "message": "What is PO approval process?"})
    body = response.json()
    assert response.status_code == 200
    assert body["requires_rag"] is True
    assert body["intent"] == "POLICY_QUERY"


@pytest.mark.asyncio
async def test_blocked_po_combined_flow():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"userId": "EMP001", "message": "Why PO 6000123456 blocked?"})
    body = response.json()
    assert response.status_code == 200
    assert body["requires_api"] is True
    assert body["requires_rag"] is True


@pytest.mark.asyncio
async def test_invoice_status_backend():
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as client:
        response = await client.post("/chat", json={"userId": "EMP001", "message": "Invoice 5100001234 status"})
    body = response.json()
    assert response.status_code == 200
    assert body["intent"] == "GET_INVOICE_STATUS"
    assert body["backend"] == "SAP_FI"

from __future__ import annotations

import json
from typing import Any

import httpx

from config.settings import get_settings
from llm.prompts import SYSTEM_PROMPT


settings = get_settings()


class LLMUnavailableError(RuntimeError):
    pass


async def generate_response(messages: list[dict[str, str]]) -> str:
    payload = {"model": settings.llm_model, "messages": messages, "temperature": 0.1}
    try:
        async with httpx.AsyncClient(timeout=settings.request_timeout_seconds) as client:
            response = await client.post(f"{settings.llm_base_url}/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()
            return data["choices"][0]["message"]["content"]
    except Exception as exc:  # pragma: no cover - network failure path
        raise LLMUnavailableError(str(exc)) from exc


def _safe_json_loads(content: str) -> dict[str, Any]:
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return {}


async def extract_intent(user_message: str) -> dict[str, Any]:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message},
    ]
    content = await generate_response(messages)
    return _safe_json_loads(content)


async def create_answer(user_message: str, context: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": f"User message: {user_message}\nContext: {context}"},
    ]
    return await generate_response(messages)

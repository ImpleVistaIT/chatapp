from __future__ import annotations

import json
from pathlib import Path
from typing import Any


def load_business_rules(path: str | Path = Path(__file__).with_name("business_rules.json")) -> dict[str, Any]:
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


def resolve_document_backend(document_number: str, rules: dict[str, Any] | None = None) -> dict[str, str]:
    rules = rules or load_business_rules()
    if document_number.startswith("6"):
        return {"document": "PO", "backend": "S4HANA"}
    if document_number.startswith("4"):
        return {"document": "PO", "backend": "ECC"}
    if document_number.startswith("51"):
        return {"document": "INVOICE", "backend": "SAP_FI"}
    if document_number.startswith("80"):
        return {"document": "DELIVERY", "backend": "EWM"}
    return {"document": "UNKNOWN", "backend": "UNKNOWN"}

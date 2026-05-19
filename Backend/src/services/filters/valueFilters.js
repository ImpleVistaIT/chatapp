import { normalizeText } from "./text.js";
import { FIELD_HINTS } from "../extractor/fieldhints.js";

function opFromWord(word) {
  const w = String(word || "").toLowerCase();

  if (["greater", "more", "above", "over"].includes(w)) return "gt";
  if (["less", "below", "under"].includes(w)) return "lt";
  if (["min", "minimum"].includes(w)) return "ge";
  if (["max", "maximum"].includes(w)) return "le";
  if (["equal", "equals", "exactly"].includes(w)) return "eq";

  return null;
}

function resolveFieldFromHints(normMessage, allowedFields) {
  const allowedSet = new Set((allowedFields || []).map((f) => String(f).toLowerCase()));

  for (const h of FIELD_HINTS) {
    const fieldLower = String(h.field).toLowerCase();
    if (!allowedSet.has(fieldLower)) continue;

    if ((h.terms || []).some((t) => normMessage.includes(normalizeText(t)))) {
      return h.field;
    }
  }

  return null;
}

/**
 * Extract numeric comparison filters.
 * Returns:
 * { field:"NetPrice", op:"gt", value:1000, type:"number" }
 */
export function extractNumericFilters(message, allowedFields) {
  const m = normalizeText(message);
  const filters = [];

  const field = resolveFieldFromHints(m, allowedFields);
  if (!field) return filters;

  const between = m.match(/\bbetween\s+(-?\d+(\.\d+)?)\s+and\s+(-?\d+(\.\d+)?)\b/);
  if (between) {
    const a = Number(between[1]);
    const b = Number(between[3]);

    if (Number.isFinite(a) && Number.isFinite(b)) {
      filters.push({ field, op: "ge", value: Math.min(a, b), type: "number" });
      filters.push({ field, op: "le", value: Math.max(a, b), type: "number" });
    }

    return filters;
  }

  const symbolic = m.match(/\b(>=|<=|>|<|=)\s*(-?\d+(\.\d+)?)\b/);
  if (symbolic) {
    const symbol = symbolic[1];
    const num = Number(symbolic[2]);

    if (Number.isFinite(num)) {
      const op =
        symbol === ">=" ? "ge" :
        symbol === "<=" ? "le" :
        symbol === ">" ? "gt" :
        symbol === "<" ? "lt" :
        "eq";

      filters.push({ field, op, value: num, type: "number" });
    }

    return filters;
  }

  const comp = m.match(/\b(greater|more|less|below|under|above|over|equal|equals|exactly)\s+(than\s+)?(-?\d+(\.\d+)?)\b/);
  if (comp) {
    const op = opFromWord(comp[1]);
    const num = Number(comp[3]);

    if (op && Number.isFinite(num)) {
      filters.push({ field, op, value: num, type: "number" });
    }

    return filters;
  }

  const minmax = m.match(/\b(min|mininum|minimum|max|maximum)\s+(-?\d+(\.\d+)?)\b/);
  if (minmax) {
    const normalizedWord = minmax[1] === "mininum" ? "minimum" : minmax[1];
    const op = opFromWord(normalizedWord);
    const num = Number(minmax[2]);

    if (op && Number.isFinite(num)) {
      filters.push({ field, op, value: num, type: "number" });
    }

    return filters;
  }

  const equalTo = m.match(/\b(equal\s+to|equals)\s+(-?\d+(\.\d+)?)\b/);
  if (equalTo) {
    const num = Number(equalTo[2]);

    if (Number.isFinite(num)) {
      filters.push({ field, op: "eq", value: num, type: "number" });
    }

    return filters;
  }

  return filters;
}
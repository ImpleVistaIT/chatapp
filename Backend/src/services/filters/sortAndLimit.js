import { normalizeText } from "./text.js";
import { FIELD_HINTS } from "../extractor/fieldhints.js";

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

export function extractLimit(message) {
  const m = normalizeText(message);

  const topMatch = m.match(/\b(top|first|last)\s+(\d{1,3})\b/);
  if (topMatch?.[2]) return Math.max(1, Math.min(200, Number(topMatch[2])));

  const showMatch = m.match(/\bshow\s+(\d{1,3})\b/);
  if (showMatch?.[1]) return Math.max(1, Math.min(200, Number(showMatch[1])));

  const limitMatch = m.match(/\blimit\s+(\d{1,3})\b/);
  if (limitMatch?.[1]) return Math.max(1, Math.min(200, Number(limitMatch[1])));

  return null;
}

export function extractSkip(message) {
  const m = normalizeText(message);

  const skipMatch = m.match(/\bskip\s+(\d{1,6})\b/);
  if (skipMatch?.[1]) return Math.max(0, Number(skipMatch[1]));

  const offsetMatch = m.match(/\boffset\s+(\d{1,6})\b/);
  if (offsetMatch?.[1]) return Math.max(0, Number(offsetMatch[1]));

  const pageMatch = m.match(/\bpage\s+(\d{1,6})\b/);
  if (pageMatch?.[1]) {
    const page = Math.max(1, Number(pageMatch[1]));
    const limit = extractLimit(message) || 10;
    return (page - 1) * limit;
  }

  return null;
}

export function extractCount(message) {
  const m = normalizeText(message);
  return /\b(count|total|how many|number of)\b/.test(m);
}

export function extractOrderBy(message, allowedFields, defaultDateField = "PoDocDate") {
  const m = normalizeText(message);
  const orderBy = [];

  const latest = /\b(latest|newest|recent|recently)\b/.test(m);
  const oldest = /\b(oldest)\b/.test(m);

  const highest = /\b(highest|maximum|max)\b/.test(m);
  const lowest = /\b(lowest|minimum|min)\b/.test(m);

  const explicitSort = m.match(
    /\b(sort|order)\s+by\s+([a-zA-Z][a-zA-Z0-9\s._-]*?)(\s+(asc|ascending|desc|descending))?\b/
  );

  if (explicitSort) {
    const fieldHintText = explicitSort[2];
    const dirWord = explicitSort[4];
    const field = resolveFieldFromHints(normalizeText(fieldHintText), allowedFields);

    if (field) {
      orderBy.push({
        field,
        dir: dirWord && /desc|descending/.test(dirWord) ? "desc" : "asc",
      });
      return orderBy;
    }
  }

  if (latest) {
    orderBy.push({ field: defaultDateField, dir: "desc" });
  } else if (oldest) {
    orderBy.push({ field: defaultDateField, dir: "asc" });
  }

  const hintedField = resolveFieldFromHints(m, allowedFields);
  if (hintedField && (highest || lowest)) {
    orderBy.push({ field: hintedField, dir: highest ? "desc" : "asc" });
  }

  return orderBy;
}
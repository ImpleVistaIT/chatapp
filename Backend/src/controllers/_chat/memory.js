import { ChatMessage } from "../../models/ChatMessage.model.js";

// ------------------------
// Memory helpers (keep yours)
// ------------------------
export function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[_\-()/]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function buildFieldIndex({ allowedFields = [], fieldLabels = {} }) {
  const out = [];
  for (const f of allowedFields) {
    const label = fieldLabels?.[f] || "";
    const keys = new Set();
    keys.add(normalizeText(f));
    keys.add(normalizeText(f.replace(/[A-Z]/g, " $&")));
    if (label) keys.add(normalizeText(label));
    out.push({ field: f, keys: [...keys].filter(Boolean) });
  }
  return out;
}

export function pickBestFieldFromQuestion({ question, fieldIndex }) {
  const q = normalizeText(question);
  if (!q) return null;

  let best = { field: null, score: 0 };
  const qTokens = new Set(q.split(" ").filter(Boolean));

  for (const entry of fieldIndex) {
    for (const k of entry.keys) {
      if (!k) continue;
      if (q === k) return entry.field;

      if (q.includes(k) || k.includes(q)) {
        const score = Math.min(100, k.length + 10);
        if (score > best.score) best = { field: entry.field, score };
      }

      const kTokens = new Set(k.split(" ").filter(Boolean));
      let overlap = 0;
      for (const t of qTokens) if (kTokens.has(t)) overlap++;

      if (overlap >= 2) {
        const score = overlap * 10 + k.length;
        if (score > best.score) best = { field: entry.field, score };
      }
    }
  }

  return best.score >= 15 ? best.field : null;
}

export async function loadLastAssistantMemory({ owner, sessionId }) {
  const last = await ChatMessage.findOne({
    owner,
    sessionId,
    role: "assistant",
    data: { $ne: null },
  })
    .sort({ createdAt: -1 })
    .select({
      role: 1,
      text: 1,
      summary: 1,
      data: 1,
      extracted: 1,
      sapRequest: 1,
      createdAt: 1,
    });

  if (!last) return null;

  return {
    data: Array.isArray(last.data) ? last.data : null,
    extracted: last.extracted || null,
    sapRequest: last.sapRequest || null,
  };
}

export function isDetailFollowUpQuery(query) {
  const q = normalizeText(query);

  if (!q) return false;

  const exactMatches = new Set([
    "details",
    "show details",
    "show me details",
    "open details",
    "show item",
    "open item",
    "show po details",
    "show purchase order details",
  ]);

  if (exactMatches.has(q)) return true;

  return (
    q.includes("details") ||
    q.includes("detail") ||
    q.includes("show item") ||
    q.includes("open item") ||
    q.includes("line item")
  );
}

export function extractRequestedItemFromQuery(query) {
  const q = String(query || "");
  const m =
    q.match(/\bitem\s*0*([0-9]{1,6})\b/i) ||
    q.match(/\bline\s*item\s*0*([0-9]{1,6})\b/i);

  if (!m) return null;
  return String(m[1]);
}

export function inferDocContextFromMemory({ memory, idField, itemField = "PoItem" }) {
  const rows = memory?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const row = rows[0];
  if (!row || typeof row !== "object") return null;

  const docNumber = row?.[idField] ?? null;
  const docItem = row?.[itemField] ?? null;

  return {
    docNumber: docNumber ? String(docNumber).trim() : null,
    docItem: docItem ? String(docItem).trim() : null,
    row,
  };
}


export function tryAnswerFromMemory({ query, memory, allowedFields, fieldLabels, extracted, idField }) {
  // never answer LIST queries from memory (memory is single-row)
  const isListQuery =
    Boolean(extracted?.listMode) ||
    (Array.isArray(extracted?.filters) && extracted.filters.length > 0) ||
    (Array.isArray(extracted?.orderBy) && extracted.orderBy.length > 0) ||
    (extracted?.limit != null && Number.isFinite(Number(extracted.limit)) && Number(extracted.limit) > 0);

  if (isListQuery) return null;
  if (isDetailFollowUpQuery(query)) return null;

  const rows = memory?.data;
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const row = rows[0];
  if (!row || typeof row !== "object") return null;

  const fieldIndex = buildFieldIndex({ allowedFields, fieldLabels });
  const field = pickBestFieldFromQuestion({ question: query, fieldIndex });
  if (!field) return null;

  const label = fieldLabels?.[field] || field;
  const value = row?.[field] ?? row?.[String(field).toLowerCase()] ?? row?.[String(field).toUpperCase()];
  if (value == null || String(value).trim() === "") return null;

  const docNo = row?.[idField];
  if (docNo) return `${label} (${idField} ${docNo}): ${String(value)}`;

  return `${label}: ${String(value)}`;
}
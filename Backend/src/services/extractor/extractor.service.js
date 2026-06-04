import { ApiError } from "../../utils/errors.js";
import { FIELD_HINTS, FIELD_HINTS_PART2, FIELD_HINTS_PART3 } from "./fieldhints.js";

import { extractDateFilters } from "../filters/dateFilters.js";
import { extractNumericFilters } from "../filters/valueFilters.js";
import {
  extractLimit,
  extractOrderBy,
  extractSkip,
  extractCount,
} from "../filters/sortAndLimit.js";

import { FIELD_BUNDLES } from "./fieldBundles.js";
import { INTENT_RULES } from "./intentRules.js";

const ALL_FIELD_HINTS = [
  ...(Array.isArray(FIELD_HINTS) ? FIELD_HINTS : []),
  ...(Array.isArray(FIELD_HINTS_PART2) ? FIELD_HINTS_PART2 : []),
  ...(Array.isArray(FIELD_HINTS_PART3) ? FIELD_HINTS_PART3 : []),
];

async function getFetch() {
  if (typeof fetch === "function") return fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

const MAX_CHARS = Number(process.env.LLM_EXTRACTOR_MAX_CHARS || 2000);
const CANDIDATE_LIMIT = Number(process.env.LLM_FIELD_CANDIDATE_LIMIT || 30);

function safeJsonFromText(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function singularizeToken(t) {
  if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

function tokenize(s) {
  const norm = normalizeText(s);
  if (!norm) return [];
  return norm.split(" ").map(singularizeToken).filter(Boolean);
}

function applySynonymsToTokens(tokens) {
  const map = new Map([
    ["ccy", "currency"],
    ["curr", "currency"],
    ["doc", "document"],
    ["del", "delivery"],
    ["uom", "unit"],
    ["fx", "exchange"],
    ["exch", "exchange"],
    ["vendor", "supplier"],
    ["seller", "supplier"],
    ["product", "material"],
    ["sku", "material"],
  ]);
  return tokens.map((t) => map.get(t) || t);
}

function normalizeNumericId(value, padLen) {
  if (value == null) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  if (!padLen) return digits;
  return digits.padStart(padLen, "0").slice(-padLen);
}

function normalizePoItem(poItem) {
  return normalizeNumericId(poItem, 5);
}

function extractDocNumberFallback(message) {
  const m = String(message || "");

  const pref = m.match(/\b(po|purchase\s*order)\s*[:#\-()]?\s*(\d{8,12})\b/i);
  if (pref?.[2]) return pref[2];

  const withArticle = m.match(/\b(the\s+)?(po|purchase\s*order)\s+(\d{8,12})\b/i);
  if (withArticle?.[3]) return withArticle[3];

  const ten = m.match(/\b\d{10}\b/);
  if (ten) return ten[0];

  const any = m.match(/\b\d{8,12}\b/);
  return any ? any[0] : null;
}

function extractPoItemFallback(message) {
  const m = String(message || "");
  const match = m.match(
    /\b(po\s*items?|poitems?|po\s*item|poitem|item|line\s*item|line)\s*[:#\-()]?\s*(\d{1,5})\b/i
  );
  return match?.[2] ? normalizePoItem(match[2]) : null;
}

function levenshtein(a, b) {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }

  return dp[m][n];
}

function similarity(a, b) {
  const A = normalizeText(a);
  const B = normalizeText(b);
  if (!A || !B) return 0;
  const dist = levenshtein(A, B);
  return 1 - dist / Math.max(A.length, B.length);
}

function buildLabelIndex(allowedFields, fieldLabels) {
  const allowed = Array.isArray(allowedFields) ? allowedFields : [];
  const labels = fieldLabels && typeof fieldLabels === "object" ? fieldLabels : {};

  const index = [];
  for (const f of allowed) {
    const label = labels[f] || "";
    const labelNorm = normalizeText(label);
    const labelTokens = applySynonymsToTokens(tokenize(label));
    index.push({ field: f, fieldLower: String(f).toLowerCase(), label, labelNorm, labelTokens });
  }
  return index;
}

function extractFieldsByLabels({ message, allowedFields, fieldLabels }) {
  const qNorm = normalizeText(message);
  const qTokens = applySynonymsToTokens(tokenize(message));
  const qTokenSet = new Set(qTokens);

  const allowedMap = new Map(allowedFields.map((f) => [String(f).toLowerCase(), f]));
  const labelIndex = buildLabelIndex(allowedFields, fieldLabels);

  const picked = new Map();

  for (const [low, orig] of allowedMap.entries()) {
    if (qNorm.includes(low)) picked.set(orig, Math.max(picked.get(orig) || 0, 100));
  }

  for (const entry of labelIndex) {
    if (entry.labelNorm && qNorm.includes(entry.labelNorm)) {
      picked.set(entry.field, Math.max(picked.get(entry.field) || 0, 80));
    }
  }

  for (const entry of labelIndex) {
    if (!entry.labelTokens.length) continue;
    let overlap = 0;
    for (const t of entry.labelTokens) if (qTokenSet.has(t)) overlap++;

    const minOverlap = entry.labelTokens.length >= 2 ? 2 : 1;
    if (overlap >= minOverlap) {
      picked.set(entry.field, Math.max(picked.get(entry.field) || 0, 20 + overlap * 10));
    }
  }

  const FUZZY_TOKEN_SIM_THRESHOLD = 0.86;
  for (const entry of labelIndex) {
    if (!entry.labelTokens.length) continue;

    for (const qt of qTokens) {
      if (qt.length < 4) continue;
      for (const lt of entry.labelTokens) {
        if (lt.length < 4) continue;
        const sim = similarity(qt, lt);
        if (sim >= FUZZY_TOKEN_SIM_THRESHOLD) {
          picked.set(entry.field, Math.max(picked.get(entry.field) || 0, 25));
        }
      }
    }
  }

  return [...picked.entries()].sort((a, b) => b[1] - a[1]).map(([f]) => f);
}

function extractFieldsByHints(message, allowedFields) {
  const q = normalizeText(message);
  const allowedSet = new Set((allowedFields || []).map((f) => String(f).toLowerCase()));

  const picked = [];
  for (const h of ALL_FIELD_HINTS) {
    const fieldLower = String(h.field).toLowerCase();
    if (!allowedSet.has(fieldLower)) continue;
    if ((h.terms || []).some((t) => q.includes(normalizeText(t)))) picked.push(h.field);
  }
  return picked;
}

function extractFieldsByBundles(message, allowedFields) {
  const q = normalizeText(message);
  const allowedSet = new Set((allowedFields || []).map((f) => String(f).toLowerCase()));

  const picked = [];
  for (const b of Array.isArray(FIELD_BUNDLES) ? FIELD_BUNDLES : []) {
    const hit = (b.terms || []).some((t) => q.includes(normalizeText(t)));
    if (!hit) continue;
    for (const f of b.fields || []) if (allowedSet.has(String(f).toLowerCase())) picked.push(f);
  }
  return picked;
}

function detectIntent(message) {
  const q = normalizeText(message);

  for (const rule of Array.isArray(INTENT_RULES) ? INTENT_RULES : []) {
    const hitTerms = (rule.terms || []).some((t) => q.includes(normalizeText(t)));
    if (hitTerms) return rule;

    for (const p of rule.patterns || []) {
      try {
        const re = new RegExp(p, "i");
        if (re.test(q)) return rule;
      } catch {
        // ignore bad regex
      }
    }
  }

  return null;
}

function getCandidateFields(message, allowedFields, limit = 30) {
  const allowed = Array.isArray(allowedFields) ? allowedFields : [];
  if (allowed.length <= limit) return allowed;

  const q = normalizeText(message);
  const scores = new Map();
  for (const f of allowed) scores.set(f, 0);

  for (const f of allowed) {
    const low = String(f).toLowerCase();
    if (q.includes(low)) scores.set(f, (scores.get(f) || 0) + 10);
    if (q.includes("date") && low.includes("date")) scores.set(f, (scores.get(f) || 0) + 2);
    if (q.includes("price") && low.includes("price")) scores.set(f, (scores.get(f) || 0) + 2);
    if (q.includes("volume") && low.includes("vol")) scores.set(f, (scores.get(f) || 0) + 2);
    if (q.includes("weight") && low.includes("wt")) scores.set(f, (scores.get(f) || 0) + 2);
  }

  for (const h of ALL_FIELD_HINTS) {
    if (!scores.has(h.field)) continue;
    if ((h.terms || []).some((t) => q.includes(normalizeText(t)))) {
      scores.set(h.field, (scores.get(h.field) || 0) + 50);
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([f]) => f);
}

function buildPrompt({ message, allowedFields }) {
  return `
You are an information extraction system for SAP Purchase Orders.

Extract ONLY:
- SAP field names from allowed list
- docNumber
- docItem

Return ONLY JSON:
{
  "fields": [],
  "docNumber": null,
  "docItem": null
}

STRICT RULES:
- Use ONLY fields from this list:
${JSON.stringify(allowedFields)}

- DO NOT invent fields
- Always prefer exact field names from list

- docNumber = digits only (usually 10 digits)
- docItem = digits only (PO item 5 digits)

User:
${JSON.stringify(message)}
`.trim();
}

async function callExtractorLLM({ message, allowedFields }) {
  const url = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
  const model = process.env.OLLAMA_MODEL || "llama3:latest";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 8000);

  const candidates = getCandidateFields(message, allowedFields, CANDIDATE_LIMIT);
  const prompt = buildPrompt({ message, allowedFields: candidates });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const f = await getFetch();

    const resp = await f(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0,
          num_predict: 100,
          stop: ["}\n", "}\r\n", "}"],
        },
      }),
    });

    if (!resp.ok) return null;

    const json = await resp.json();
    const parsed = safeJsonFromText(json?.response);
    if (!parsed || typeof parsed !== "object") return null;

    return parsed;
  } catch (e) {
    if (e?.name === "AbortError") return null;
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function pickPoDateField(message, allowedFields) {
  const q = String(message || "").toLowerCase();
  const set = new Set((allowedFields || []).map((f) => String(f).toLowerCase()));

  const createdCandidates = ["CrtDate", "CreatedOn"];
  const documentCandidates = ["PoDocDate", "DocDate", "DocumentDate"];
  const hasLatestWords = /\b(latest|newest|recent|recently|most\s+recent)\b/.test(q);

  if (/\b(created|created on|created in|creation)\b/.test(q)) {
    for (const c of createdCandidates) {
      if (set.has(String(c).toLowerCase())) return c;
    }
  }

  if (/\b(document date|doc date|po date)\b/.test(q)) {
    for (const c of documentCandidates) {
      if (set.has(String(c).toLowerCase())) return c;
    }
  }

  // For "latest/recent" PO queries, users typically mean latest by document date.
  if (hasLatestWords) {
    for (const c of [...documentCandidates, ...createdCandidates]) {
      if (set.has(String(c).toLowerCase())) return c;
    }
  }

  for (const c of [...documentCandidates, ...createdCandidates]) {
    if (set.has(String(c).toLowerCase())) return c;
  }

  return "PoDocDate";
}

function extractUserCreatedFilters(message, allowedFields) {
  const text = String(message || "");
  const q = normalizeText(text);

  const allowedSet = new Set((allowedFields || []).map((f) => String(f).toLowerCase()));
  if (!allowedSet.has("usercreated")) return [];

  const m =
    text.match(/\bcreated\s*by\s*[:=]?\s*([A-Za-z0-9_@.\-]+)\b/i) ||
    text.match(/\bcreatedby\s*[:=]?\s*([A-Za-z0-9_@.\-]+)\b/i);

  if (!m?.[1]) return [];

  const user = String(m[1]).trim();
  if (!user) return [];

  if (["me", "my", "user", "someone"].includes(q.split(" ").pop())) {
    // optional: resolve current sap user later
  }

  return [
    {
      field: "UserCreated",
      op: "eq",
      type: "string",
      value: user,
    },
  ];
}

export async function extractDocQuery({ query, allowedFields, fieldLabels }) {
  const message = String(query || "").trim();
  if (!message) throw new ApiError(400, "query is required");
  if (!Array.isArray(allowedFields) || allowedFields.length === 0) {
    throw new ApiError(500, "allowedFields is required");
  }

  const truncated = message.length > MAX_CHARS ? message.slice(0, MAX_CHARS) : message;
  const poDateField = pickPoDateField(truncated, allowedFields);

  const out = {
    docType: "PO",
    fields: [],
    docNumber: extractDocNumberFallback(truncated),
    docItem: extractPoItemFallback(truncated),
    filters: [],
    orderBy: [],
    limit: null,
    skip: null,
    listMode: null,
    latestMode: false,  
    count: false,
  };

  out.filters.push(...extractDateFilters(truncated, poDateField));
  out.filters.push(...extractNumericFilters(truncated, allowedFields));
  out.filters.push(...extractUserCreatedFilters(truncated, allowedFields));

  out.orderBy = extractOrderBy(truncated, allowedFields, poDateField) || [];
  if (Array.isArray(out.orderBy) && out.orderBy.length > 0) {
    const allowedSet = new Set((allowedFields || []).map((f) => String(f).toLowerCase()));
    out.orderBy = out.orderBy.filter((o) => allowedSet.has(String(o?.field || "").toLowerCase()));
  }
  out.limit = extractLimit(truncated);
  out.skip = extractSkip(truncated);
  out.count = extractCount(truncated);

  const labelPicked = extractFieldsByLabels({ message: truncated, allowedFields, fieldLabels });
  const hintPicked = extractFieldsByHints(truncated, allowedFields);
  const bundlePicked = extractFieldsByBundles(truncated, allowedFields);

  const qNorm = normalizeText(truncated);
  const hasDocumentContext = Boolean(out.docNumber);
  const wantsDetails = /\b(details?|info|information|full details|complete details|all details|show details)\b/.test(qNorm);
  const autoBundlePicked = hasDocumentContext && wantsDetails
    ? extractFieldsByBundles("details", allowedFields)
    : [];

  const intent = detectIntent(truncated);

  if (intent && !out.docNumber) {
    out.listMode = intent.listMode || null;
  if (intent.listMode === "latest_po") {
  out.latestMode = true;
  }

    if (!out.orderBy || out.orderBy.length === 0) {
      if (out.listMode === "latest_po") {
        out.orderBy = [{ field: poDateField, dir: "desc" }];
      } else if (Array.isArray(intent.defaultOrderBy)) {
        const allowedSet = new Set((allowedFields || []).map((f) => String(f).toLowerCase()));
        out.orderBy = intent.defaultOrderBy.filter((o) =>
          allowedSet.has(String(o?.field || "").toLowerCase())
        );
      }
    }

    if (out.limit == null && Number.isFinite(Number(intent.defaultLimit))) {
      out.limit = Number(intent.defaultLimit);
    }
  }

  const combined = Array.from(new Set([...labelPicked, ...hintPicked, ...bundlePicked, ...autoBundlePicked]));
  const userPickedAny = combined.length > 0;

  const isNextQuery = /\b(next|more|another|load)\b/i.test(qNorm);
  const hasExplicitFieldRequest = /\b(price|net\s*price|amount|value|currency|date|created|vendor|supplier|volume|weight|quantity|unit|material|plant|storage|company\s*code)\b/i.test(
    qNorm
  );

  if (isNextQuery && intent && Array.isArray(intent.defaultFields) && !hasExplicitFieldRequest) {
    const allowedSet = new Set(allowedFields.map((f) => String(f).toLowerCase()));
    out.fields = intent.defaultFields.filter((f) => allowedSet.has(String(f).toLowerCase()));
    return out;
  }

  const isGenericPoListQuery =
    intent &&
    !out.docNumber &&
    !out.docItem &&
    /^(show|list|get)\s+(all\s+)?(latest\s+|recent\s+|most\s+recent\s+)?(po|purchase\s*order[s]?)\b/.test(qNorm);

  if (isGenericPoListQuery && Array.isArray(intent.defaultFields)) {
    const allowedSet = new Set(allowedFields.map((f) => String(f).toLowerCase()));
    out.fields = intent.defaultFields.filter((f) => allowedSet.has(String(f).toLowerCase()));
    return out;
  }

  if (intent && !out.docNumber && !userPickedAny && Array.isArray(intent.defaultFields)) {
    const allowedSet = new Set(allowedFields.map((f) => String(f).toLowerCase()));
    out.fields = intent.defaultFields.filter((f) => allowedSet.has(String(f).toLowerCase()));
    return out;
  }

  if (combined.length > 0) {
    out.fields = combined;
    return out;
  }

  if (out.docNumber && (!out.fields || out.fields.length === 0)) {
    const detailDefaults = extractFieldsByBundles("details", allowedFields);
    if (detailDefaults.length > 0) {
      out.fields = detailDefaults;
      return out;
    }
  }

  const parsed = await callExtractorLLM({ message: truncated, allowedFields });
  if (!parsed) return out;

  const parsedDocNumber =
    (typeof parsed.docNumber === "string" && parsed.docNumber.trim() ? parsed.docNumber.trim() : null) ||
    (typeof parsed.poNumber === "string" && parsed.poNumber.trim() ? parsed.poNumber.trim() : null);

  if (parsedDocNumber) out.docNumber = parsedDocNumber;

  const parsedItem = parsed.docItem ?? parsed.poItem ?? null;
  out.docItem = normalizePoItem(parsedItem) || out.docItem;

  const allowedMap = new Map(allowedFields.map((f) => [String(f).toLowerCase(), f]));
  const fields = Array.isArray(parsed.fields) ? parsed.fields : [];
  out.fields = fields.map((f) => allowedMap.get(String(f).toLowerCase())).filter(Boolean);

  if (out.docNumber && (!out.fields || out.fields.length === 0)) {
    const detailDefaults = extractFieldsByBundles("details", allowedFields);
    if (detailDefaults.length > 0) {
      out.fields = detailDefaults;
    }
  }

  return out;
}

export async function extractPoQuery({ query, allowedFields, fieldLabels }) {
  const r = await extractDocQuery({ query, allowedFields, fieldLabels });
  console.log("🧠 EXTRACTOR OUTPUT:", JSON.stringify(r, null, 2));
  return {
    fields: r.fields,
    poNumber: r.docNumber,
    poItem: r.docItem,
    filters: r.filters,
    orderBy: r.orderBy,
    limit: r.limit,
    skip: r.skip,
    listMode: r.listMode,
    latestMode: r.latestMode, // NEW
    docType: r.docType,
    docNumber: r.docNumber,
    docItem: r.docItem,
    count: r.count,
  };
}
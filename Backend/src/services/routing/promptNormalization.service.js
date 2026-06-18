import { generateJson } from "../llm/ollama.client.js";

function clampConfidence(value) {
  const x = Number(value);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function cleanString(value) {
  return String(value || "").trim();
}

function hasAlphabeticToken(query) {
  return /[a-z]/i.test(String(query || ""));
}

const SAFE_PROMPT_WORDS = new Set([
  "show",
  "list",
  "get",
  "fetch",
  "find",
  "view",
  "what",
  "why",
  "who",
  "when",
  "where",
  "how",
  "can",
  "could",
  "should",
  "would",
  "do",
  "does",
  "is",
  "are",
  "was",
  "were",
  "please",
  "help",
  "details",
  "detail",
  "latest",
  "recent",
  "newest",
  "created",
  "create",
  "by",
  "in",
  "from",
  "to",
  "for",
  "of",
  "on",
  "with",
  "and",
  "or",
  "top",
  "last",
  "all",
  "my",
  "me",
  "where",
  "when",
  "open",
  "closed",
  "pending",
  "approved",
  "rejected",
  "status",
  "count",
  "user",
  "username",
  "cr",
  "po",
  "purchase",
  "order",
  "orders",
  "change",
  "request",
  "requests",
  "sap",
  "row",
  "india",
  "next",
  "previous",
  "this",
  "month",
  "year",
  "week",
  "today",
  "yesterday",
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
]);

function normalizeToken(token) {
  return String(token || "").toLowerCase().trim();
}

function looksLikeCodeOrId(token) {
  const t = normalizeToken(token);
  if (!t) return false;
  if (/^\d+$/.test(t)) return true;
  if (/^[a-z0-9]+(?:[_-][a-z0-9]+)+$/i.test(t)) return true;
  if (/^[a-z]{1,6}\d+[a-z0-9_-]*$/i.test(t)) return true;
  return false;
}

function isSuspiciousToken(token) {
  const t = normalizeToken(token);
  if (!t) return false;
  if (SAFE_PROMPT_WORDS.has(t)) return false;
  if (looksLikeCodeOrId(t)) return false;
  if (/^[a-z]+$/i.test(t) && t.length <= 3) return false;

  if (/([a-z])\1{1,}/i.test(t)) return true;
  if (t.length >= 5 && !(t.includes("a") || t.includes("e") || t.includes("i") || t.includes("o") || t.includes("u"))) {
    return true;
  }

  return /^[a-z]+$/i.test(t);
}

export function shouldRunPromptNormalizer(query) {
  const q = cleanString(query);
  if (!q) return false;
  if (q.length > 240) return false;
  if (!hasAlphabeticToken(q)) return false;

  const tokens = q.match(/[a-z0-9_]+/gi) || [];
  if (tokens.length === 0) return false;

  return tokens.some(isSuspiciousToken);
}

function buildPromptNormalizerPrompt(query) {
  return `You normalize SAP chatbot user prompts.

Return ONLY JSON with exactly this shape:
{
  "normalizedQuery": "string",
  "isMeaningful": true,
  "shouldReject": false,
  "confidence": 0.0,
  "reason": "string"
}

Rules:
- Keep business meaning unchanged.
- Fix spelling/typing mistakes (example: "showss po creatd by S4H_MM" -> "show po created by S4H_MM").
- Keep IDs, usernames, codes exactly as user typed.
- If prompt is random gibberish, set shouldReject=true and isMeaningful=false.
- confidence must be between 0 and 1.
- No extra keys and no explanation outside JSON.

User prompt:
${JSON.stringify(String(query || ""))}`.trim();
}

export async function normalizePromptWithLlm({ query }) {
  const original = cleanString(query);
  if (!shouldRunPromptNormalizer(original)) {
    return {
      normalizedQuery: original,
      rejected: false,
      confidence: 0,
      usedLlm: false,
      error: null,
      reason: "skipped",
    };
  }

  const timeoutMs = Number(process.env.PROMPT_NORMALIZER_TIMEOUT_MS || 2500);
  const prompt = buildPromptNormalizerPrompt(original);

  const out = await generateJson({
    prompt,
    schemaHint: "prompt_normalizer",
    timeoutMs,
  });

  if (!out?.ok || !out?.data || typeof out.data !== "object") {
    return {
      normalizedQuery: original,
      rejected: false,
      confidence: 0,
      usedLlm: false,
      error: out?.error || "PROMPT_NORMALIZER_FAILED",
      reason: "fallback_original",
    };
  }

  const data = out.data;
  const normalized = cleanString(data.normalizedQuery) || original;
  const confidence = clampConfidence(data.confidence);
  const isMeaningful = data.isMeaningful !== false;
  const shouldReject = data.shouldReject === true;

  const rejected = shouldReject || (!isMeaningful && confidence >= 0.55);

  return {
    normalizedQuery: normalized,
    rejected,
    confidence,
    usedLlm: true,
    error: null,
    reason: cleanString(data.reason) || null,
  };
}

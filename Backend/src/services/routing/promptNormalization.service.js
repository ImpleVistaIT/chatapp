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
  return `You are the prompt normalizer for an SAP chatbot.

Your job is to rewrite the user's text into one clean canonical prompt that preserves business meaning.
Always return JSON only. Do not answer the user's question.

Normalize all natural-language variations into the same structure by:
- fixing spelling and grammar
- ignoring filler words and word order differences
- keeping IDs, usernames, system codes, dates, and quoted values exactly as provided
- treating quoted and unquoted values the same
- preserving the intent and entities, not the exact wording

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
- Fix spelling/typing mistakes.
- Keep IDs, usernames, codes, object numbers, and dates exactly as the user typed them.
- If the prompt is gibberish or not a meaningful SAP request, set shouldReject=true and isMeaningful=false.
- confidence must be between 0 and 1.
- No extra keys, no markdown, no explanation outside JSON.

Supported request patterns include:
- SolMan change request details, status, and status distribution
- purchase orders, vendor data, invoices, materials, approvals
- date filters such as today, yesterday, this month, last 30 days, last year, and explicit from/to ranges

Examples:

Example 1
User prompt: "showss po creatd by S4H_MM"
Return:
{
  "normalizedQuery": "show po created by S4H_MM",
  "isMeaningful": true,
  "shouldReject": false,
  "confidence": 0.97,
  "reason": "Fixed spelling while preserving the system code"
}

Example 2
User prompt: "show status of change request '8000003191'"
Return:
{
  "normalizedQuery": "show status of change request 8000003191",
  "isMeaningful": true,
  "shouldReject": false,
  "confidence": 0.98,
  "reason": "Normalized quoted identifier without changing meaning"
}

Example 3
User prompt: "list crs for india last month"
Return:
{
  "normalizedQuery": "list CRs for INDIA last month",
  "isMeaningful": true,
  "shouldReject": false,
  "confidence": 0.95,
  "reason": "Normalized casing and kept the business filters"
}

Example 4
User prompt: "asdf qwe zzz"
Return:
{
  "normalizedQuery": "asdf qwe zzz",
  "isMeaningful": false,
  "shouldReject": true,
  "confidence": 0.05,
  "reason": "Gibberish input"
}

User prompt:
${JSON.stringify(String(query || ""))}`.trim();
}

function normalizePromptNormalizerResult(data, original) {
  const normalizedQuery =
    cleanString(data?.normalizedQuery) ||
    cleanString(data?.normalized_query) ||
    cleanString(data?.rewrittenQuery) ||
    cleanString(data?.rewritten_query) ||
    cleanString(data?.query) ||
    original;

  const reason =
    cleanString(data?.reason) ||
    cleanString(data?.message) ||
    cleanString(data?.explanation) ||
    null;

  const confidence = clampConfidence(data?.confidence ?? data?.score ?? 0);
  const isMeaningful = data?.isMeaningful !== false && data?.meaningful !== false;
  const shouldReject = Boolean(data?.shouldReject || data?.reject || data?.rejected);

  return {
    normalizedQuery,
    isMeaningful,
    shouldReject,
    confidence,
    reason,
  };
}

export async function normalizePromptWithLlm({ query }) {
  const original = cleanString(query);
  // NOTE: Keep the previous grammar-suspicion gate for easy rollback.
  // if (!shouldRunPromptNormalizer(original)) {
  //   return {
  //     normalizedQuery: original,
  //     rejected: false,
  //     confidence: 0,
  //     usedLlm: false,
  //     error: null,
  //     reason: "skipped",
  //   };
  // }

  const timeoutMs = Number(process.env.PROMPT_NORMALIZER_TIMEOUT_MS || 2500);
  const prompt = buildPromptNormalizerPrompt(original);

  const out = await generateJson({
    prompt,
    schemaHint: "prompt_normalizer",
    timeoutMs,
    forceProvider: "groq",
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

  const data = normalizePromptNormalizerResult(out.data, original);
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

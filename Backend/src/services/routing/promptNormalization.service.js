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

export function shouldRunPromptNormalizer(query) {
  const q = cleanString(query);
  if (!q) return false;
  if (q.length > 240) return false;
  if (!hasAlphabeticToken(q)) return false;
  return true;
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

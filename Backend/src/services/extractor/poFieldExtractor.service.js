import { ApiError } from "../../utils/errors.js";

async function getFetch() {
  if (typeof fetch === "function") return fetch;
  const mod = await import("node-fetch");
  return mod.default;
}

function normalizePoItem(poItem) {
  if (!poItem) return null;
  const digits = String(poItem).replace(/\D/g, "");
  if (!digits) return null;
  return digits.padStart(5, "0").slice(-5);
}

function extractPoNumberFallback(message) {
  const m = String(message || "");
  const ten = m.match(/\b\d{10}\b/);
  if (ten) return ten[0];
  const any = m.match(/\b\d{8,12}\b/);
  return any ? any[0] : null;
}

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

function getCandidateFields(message, allowedFields, limit = 30) {
  const q = String(message || "").toLowerCase();
  const allowed = Array.isArray(allowedFields) ? allowedFields : [];
  if (allowed.length <= limit) return allowed;

  const hints = [
    {
      terms: ["gr qty", "goods received", "goods receipt", "received qty", "delivered"],
      boost: ["Wemng", "Menge", "UnitOfMeasure"],
    },
    { terms: ["net price", "price"], boost: ["NetPrice", "CurKey", "PriceUnit"] },
    { terms: ["delivery date", "del date"], boost: ["ItemDeliDt"] },
    { terms: ["description", "short text", "text"], boost: ["ShortText"] },
    { terms: ["supplier", "vendor"], boost: ["SuppAcoutNo"] },
    { terms: ["plant"], boost: ["Plant", "StrLoc"] },
  ];

  const scores = new Map();
  for (const f of allowed) scores.set(f, 0);

  for (const f of allowed) {
    const low = String(f).toLowerCase();

    if (q.includes(low)) scores.set(f, scores.get(f) + 10);
    if (q.includes("date") && low.includes("date")) scores.set(f, scores.get(f) + 2);
    if (q.includes("price") && low.includes("price")) scores.set(f, scores.get(f) + 2);

    if (
      (q.includes("qty") || q.includes("quantity")) &&
      (low.includes("menge") || low.includes("wemng"))
    ) {
      scores.set(f, scores.get(f) + 2);
    }
  }

  for (const h of hints) {
    if (h.terms.some((t) => q.includes(t))) {
      for (const f of h.boost) {
        if (scores.has(f)) scores.set(f, scores.get(f) + 5);
      }
    }
  }

  return [...scores.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([f]) => f);
}

function buildExtractionPrompt({ message, allowedFields }) {
  // ✅ FIX: clean, single-line interpolation (no risky breaks)
  return (
`You only extract structured information from user queries related to SAP Purchase Orders.
Do NOT determine intent. Do NOT perform business logic.

Return ONLY JSON with exactly these keys:
{
  "fields": ["..."],
  "poNumber": "string or null",
  "poItem": "5-digit string or null"
}

Rules:
- "fields" must only include values from this allowed list: ${JSON.stringify(allowedFields)}.
- Never invent fields outside the allowed list.
- If no fields found, return [].
- If PO item is present, normalize to 5 digits (5 -> "00005").
- poNumber should be the PO number if present, else null.
- No extra keys, no explanations.

Map common user phrases to the correct allowed field names (only if present in allowed list):
- "goods received quantity" / "gr qty" -> Wemng
- "net price" -> NetPrice
- "delivery date" -> ItemDeliDt
- "description" -> ShortText

User message:
${JSON.stringify(message)}`
  ).trim();
}

export async function extractPoFields({ message, allowedFields }) {
  if (!Array.isArray(allowedFields) || allowedFields.length === 0) {
    throw new ApiError(500, "allowedFields is empty");
  }

  const url = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
  const model = process.env.OLLAMA_MODEL || "llama3:latest";
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 8000);

  const base = { fields: [], poNumber: null, poItem: null };

  const candidates = getCandidateFields(message, allowedFields, 30);
  const prompt = buildExtractionPrompt({ message, allowedFields: candidates });

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
          num_predict: 80,
          stop: ["}\n", "}\r\n", "}"],
        },
      }),
    });

    if (!resp.ok) {
      return {
        ...base,
        poNumber: extractPoNumberFallback(message),
        fields: getCandidateFields(message, allowedFields, 3),
      };
    }

    const json = await resp.json();
    const parsed = safeJsonFromText(json?.response);

    if (!parsed || typeof parsed !== "object") {
      return { ...base, poNumber: extractPoNumberFallback(message) };
    }

    const out = { ...base };

    out.poNumber = parsed.poNumber?.trim?.() || null;
    out.poItem = normalizePoItem(parsed.poItem);

    const fields = Array.isArray(parsed.fields) ? parsed.fields : [];
    out.fields = fields.filter((fName) => allowedFields.includes(fName));

    if (!out.poNumber) out.poNumber = extractPoNumberFallback(message);

    if (out.fields.length === 0) {
      out.fields = getCandidateFields(message, allowedFields, 3);
    }

    return out;
  } catch (e) {
    if (e?.name === "AbortError") {
      return {
        ...base,
        poNumber: extractPoNumberFallback(message),
        fields: getCandidateFields(message, allowedFields, 3),
      };
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
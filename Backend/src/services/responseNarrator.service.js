function cleanString(value) {
  return String(value || "").trim();
}

function formatFriendlyDate(value) {
  const s = cleanString(value);
  if (!s) return "";

  const compact = s.replace(/[^0-9]/g, "");
  if (/^\d{8}$/.test(compact)) {
    return `${compact.slice(0, 4)}/${compact.slice(4, 6)}/${compact.slice(6, 8)}`;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    return s.replaceAll("-", "/");
  }

  return s;
}

function sanitizeSummary(out) {
  let s = String(out || "").trim();
  if (!s) return "";

  const badLine = /(you are a strict sap assistant|do not use headings|do not invent fields|sentence 1:|sentence 2:|return only the 2 sentences)/i;

  s = s
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !badLine.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return "";

  const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(" ").trim();
}

function getSentenceCount(text) {
  const cleaned = String(text || "").trim();
  if (!cleaned) return 0;
  return cleaned.split(/(?<=[.!?])\s+/).filter(Boolean).length;
}

function buildSecondSentence({ entityLabel, count, totalCount, extracted, columns }) {
  const contextText = buildContextText(extracted);
  const colsText = Array.isArray(columns) && columns.length ? columns.slice(0, 4).join(", ") : "the main result fields";
  const visibleCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  const fullCount = Number.isFinite(Number(totalCount)) ? Number(totalCount) : visibleCount;

  if (visibleCount === 0) {
    return `Please try a more specific request so I can find the ${entityLabel} you need.`;
  }

  if (fullCount > visibleCount) {
    return `It looks like a match for ${contextText}. I’m showing ${visibleCount} out of ${fullCount} records, including ${colsText}.`;
  }

  return `It looks like a match for ${contextText}. The main details are shown in the results, including ${colsText}.`;
}

function buildContextText(extracted = {}) {
  const filters = [];

  const businessScope = cleanString(extracted?.businessScope || extracted?.scope || extracted?.region);
  const processType = cleanString(extracted?.processType || extracted?.PROCESS_TYPE);
  const createdBy = cleanString(extracted?.createdBy || extracted?.created_by || extracted?.UserCreated);
  const status = cleanString(extracted?.status || extracted?.STATUS);
  const fromDate = formatFriendlyDate(extracted?.dateFrom || extracted?.fromDate || extracted?.date_start);
  const toDate = formatFriendlyDate(extracted?.dateTo || extracted?.toDate || extracted?.date_end);
  const docNumber = cleanString(extracted?.docNumber || extracted?.PurchaseOrder || extracted?.objectId);

  if (businessScope) filters.push(`scope ${businessScope}`);
  if (processType) filters.push(`process type ${processType}`);
  if (createdBy) filters.push(`created by ${createdBy}`);
  if (status) filters.push(`status ${status}`);
  if (fromDate) filters.push(`from ${fromDate}`);
  if (toDate) filters.push(`to ${toDate}`);
  if (docNumber) filters.push(`document ${docNumber}`);

  return filters.length ? filters.join(", ") : "based on the request";
}

function buildSummaryPrompt({ entityLabel, count, totalCount, extracted, sample, columns }) {
  const colsText = Array.isArray(columns) && columns.length ? columns.join(", ") : "the key fields in the results";
  const sampleJson = JSON.stringify(Array.isArray(sample) ? sample.slice(0, 5) : [], null, 2);
  const contextText = buildContextText(extracted);
  const visibleCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  const fullCount = Number.isFinite(Number(totalCount)) ? Number(totalCount) : visibleCount;

  return `You are a helpful SAP chatbot.
Write exactly 2 short plain-English sentences in one paragraph.
Keep it simple, clear, and natural.
Do not use headings, bullets, markdown, or technical wording.
Sentence 1 should say what was found.
Sentence 2 should mention how many records are being shown out of the total returned when that is relevant.
Do not say only "Here are X ...".

Entity: ${entityLabel}
Shown Count: ${visibleCount}
Total Count: ${fullCount}
Context: ${contextText}

Sample rows (JSON, up to 5):
${sampleJson}

Return only the 2 sentences.`.trim();
}

function buildFallbackSummary({ entityLabel, count, totalCount, extracted, columns }) {
  const contextText = buildContextText(extracted);
  const visibleCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  const fullCount = Number.isFinite(Number(totalCount)) ? Number(totalCount) : visibleCount;

  if (visibleCount === 0) {
    return `I couldn’t find any ${entityLabel} ${contextText}. Please try a more specific request so I can narrow it down.`;
  }

  if (fullCount > visibleCount) {
    return `I found ${visibleCount} ${entityLabel} ${contextText}, and I’m showing ${visibleCount} out of ${fullCount} returned records below.`;
  }

  return `I found ${visibleCount} ${entityLabel} ${contextText}. The main details are shown in the results below.`;
}

function extractTextFromGeminiResponse(data) {
  const candidate = data?.candidates?.[0];
  const parts = candidate?.content?.parts;

  if (Array.isArray(parts)) {
    return parts
      .map((part) => cleanString(part?.text))
      .filter(Boolean)
      .join(" ");
  }

  return cleanString(candidate?.content?.text || data?.text || data?.response || "");
}

async function generateSummaryFromGoogleAiStudio({ entityLabel, count, totalCount, extracted, sample = [], columns = [] }) {
  const apiKey =
    process.env.GOOGLE_AI_STUDIO_API_KEY || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || "";

  if (!apiKey) {
    return { ok: false, summary: "", reason: "missing_api_key" };
  }

  const model = process.env.GEMINI_SUMMARY_MODEL || process.env.GOOGLE_AI_STUDIO_MODEL || "gemini-1.5-flash";
  const timeoutMs = Number(process.env.GEMINI_SUMMARY_TIMEOUT_MS || 1800);
  const prompt = buildSummaryPrompt({ entityLabel, count, totalCount, extracted, sample, columns });

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.2,
            topP: 0.9,
            maxOutputTokens: 96,
          },
        }),
      }
    );

    const data = await res.json().catch(() => null);
    if (!res.ok) {
      return {
        ok: false,
        summary: "",
        reason: data?.error?.message || `GEMINI_HTTP_${res.status}`,
      };
    }

    const cleaned = sanitizeSummary(extractTextFromGeminiResponse(data));
    if (!cleaned) {
      return { ok: false, summary: "", reason: "empty_response" };
    }

    return { ok: true, summary: cleaned, reason: null };
  } catch (err) {
    return {
      ok: false,
      summary: "",
      reason: err?.name === "AbortError" ? "timeout" : err?.message || String(err),
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function generateSummaryLLM({ entityLabel, count, totalCount = null, extracted, sample = [], columns = [] }) {
  const visibleCount = Number.isFinite(Number(count)) ? Number(count) : 0;
  const fullCount = Number.isFinite(Number(totalCount)) ? Number(totalCount) : visibleCount;
  const fallback = buildFallbackSummary({ entityLabel, count: visibleCount, totalCount: fullCount, extracted, columns });

  try {
    const out = await generateSummaryFromGoogleAiStudio({ entityLabel, count: visibleCount, totalCount: fullCount, extracted, sample, columns });
    const cleaned = String(out?.summary || "").trim();

    if (!cleaned) {
      return fallback;
    }

    if (getSentenceCount(cleaned) >= 2) {
      return cleaned;
    }

    const secondSentence = buildSecondSentence({ entityLabel, count: visibleCount, totalCount: fullCount, extracted, columns });
    return `${cleaned.replace(/[.?!]?\s*$/, ".")} ${secondSentence}`.trim();
  } catch (err) {
    console.error("Google AI Studio summary error:", err);
    return fallback;
  }
}
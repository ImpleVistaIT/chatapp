function sanitizeSummary(out) {
  let s = String(out || "").trim();
  if (!s) return "";

  const badLine = /(you are a strict sap assistant|absolute rules:|your task:|format:|example:|now answer:|now return only|sentence 1:|sentence 2:)/i;

  // remove instruction/prompt echo lines
  s = s
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line && !badLine.test(line))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

  if (!s) return "";

  // keep only 2 sentences max
  const sentences = s.split(/(?<=[.!?])\s+/).filter(Boolean);
  return sentences.slice(0, 2).join(" ").trim();
}

export async function generateSummaryLLM({ entityLabel, count, extracted, sample = [], columns = [] }) {
  const filters = [];

  if (extracted?.docNumber) filters.push(`for document number ${extracted.docNumber}`);
  if (extracted?.dateFrom) filters.push(`from ${extracted.dateFrom}`);
  if (extracted?.dateTo) filters.push(`to ${extracted.dateTo}`);

  const filterText = filters.length ? filters.join(", ") : "based on your request";

  const colsText =
    Array.isArray(columns) && columns.length ? columns.join(", ") : "(use only fields present in the sample)";

  const sampleJson = JSON.stringify(Array.isArray(sample) ? sample.slice(0, 5) : [], null, 2);

  const prompt = `
You are a strict SAP assistant.
Return ONLY 2 professional sentences. No headings, no bullets, no extra text.

Sentence 1: State what was retrieved (use Entity + Count + Context).
Sentence 2: State what key fields are included (use ONLY these columns: ${colsText}). Do not invent fields.

Entity: ${entityLabel}
Count: ${count}
Context: ${filterText}

Sample rows (JSON, up to 5):
${sampleJson}

Now answer:
`.trim();

  const fallback =
    `Here are the latest ${count} ${entityLabel} ${filterText}. ` +
    `These include the key fields shown in the results (${colsText}).`;

  try {
    const res = await fetch(process.env.OLLAMA_URL || "http://localhost:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.OLLAMA_SUMMARY_MODEL || "tinyllama",
        prompt,
        stream: false,
        options: {
          num_predict: 60,
          temperature: 0.2,
          top_p: 0.9,
        },
      }),
    });

    const data = await res.json();
    const cleaned = sanitizeSummary(data?.response);

    return cleaned || fallback;
  } catch (err) {
    console.error("LLM summary error:", err);
    return fallback;
  }
}
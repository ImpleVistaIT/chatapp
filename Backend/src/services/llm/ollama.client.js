import { OLLAMA_CONFIG } from "../../config/ollama.config.js";

async function getFetch() {
  if (typeof fetch === "function") return fetch;
  const mod = await import("node-fetch");
  return mod.default;
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

export async function generateJson({ prompt, schemaHint = null, timeoutMs = null } = {}) {
  const finalTimeout = Number(timeoutMs || OLLAMA_CONFIG.timeoutMs || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), finalTimeout);

  try {
    const f = await getFetch();

    const resp = await f(OLLAMA_CONFIG.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: OLLAMA_CONFIG.model,
        prompt: String(prompt || ""),
        stream: false,
        options: {
          ...OLLAMA_CONFIG.options,
        },
      }),
    });

    if (!resp.ok) {
      return {
        ok: false,
        error: `OLLAMA_HTTP_${resp.status}`,
        data: null,
      };
    }

    const json = await resp.json();
    const parsed = safeJsonFromText(json?.response);

    if (!parsed || typeof parsed !== "object") {
      return {
        ok: false,
        error: "OLLAMA_INVALID_JSON",
        data: null,
        raw: json?.response || null,
      };
    }

    return {
      ok: true,
      error: null,
      data: parsed,
      raw: json?.response || null,
      schemaHint: schemaHint || null,
    };
  } catch (e) {
    if (e?.name === "AbortError") {
      return {
        ok: false,
        error: "OLLAMA_TIMEOUT",
        data: null,
      };
    }

    return {
      ok: false,
      error: e?.message || "OLLAMA_REQUEST_FAILED",
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
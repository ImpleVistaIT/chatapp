import { LLM_CONFIG, OLLAMA_CONFIG } from "../../config/llm.config.js";

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

function getProvider() {
  const envProvider = String(process.env.LLM_PROVIDER || "").trim().toLowerCase();
  if (envProvider) return envProvider;
  return String(LLM_CONFIG.provider || "ollama").trim().toLowerCase();
}

function getGroqRuntimeConfig() {
  return {
    baseUrl: String(process.env.GROQ_BASE_URL || LLM_CONFIG.groq.baseUrl).trim(),
    apiKey: String(process.env.GROQ_API_KEY || LLM_CONFIG.groq.apiKey || "").trim(),
    model: String(process.env.GROQ_MODEL || LLM_CONFIG.groq.model).trim(),
    timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || LLM_CONFIG.groq.timeoutMs || LLM_CONFIG.timeoutMs || 8000),
    temperature: Number(process.env.GROQ_TEMPERATURE || LLM_CONFIG.groq.temperature || LLM_CONFIG.temperature || 0),
    maxTokens: Number(process.env.GROQ_MAX_TOKENS || LLM_CONFIG.groq.maxTokens || LLM_CONFIG.numPredict || 200),
  };
}

function getOllamaRuntimeConfig() {
  return {
    url: String(process.env.OLLAMA_URL || OLLAMA_CONFIG.url).trim(),
    model: String(process.env.OLLAMA_MODEL || OLLAMA_CONFIG.model).trim(),
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || OLLAMA_CONFIG.timeoutMs || 8000),
    options: {
      temperature: Number(process.env.OLLAMA_TEMPERATURE || LLM_CONFIG.temperature || 0),
      num_predict: Number(process.env.OLLAMA_NUM_PREDICT || LLM_CONFIG.numPredict || 200),
    },
  };
}

async function callOllama({ prompt, timeoutMs }) {
  const ollama = getOllamaRuntimeConfig();
  const finalTimeout = Number(timeoutMs || ollama.timeoutMs || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), finalTimeout);

  try {
    const f = await getFetch();

    const resp = await f(ollama.url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model: ollama.model,
        prompt: String(prompt || ""),
        stream: false,
        options: {
          ...ollama.options,
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

async function callGroq({ prompt, timeoutMs }) {
  const groq = getGroqRuntimeConfig();
  const finalTimeout = Number(timeoutMs || groq.timeoutMs || LLM_CONFIG.timeoutMs || 8000);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), finalTimeout);

  try {
    if (!groq.apiKey) {
      return {
        ok: false,
        error: "GROQ_API_KEY_MISSING",
        data: null,
      };
    }

    const f = await getFetch();

    const resp = await f(groq.baseUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${groq.apiKey}`,
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: groq.model,
        messages: [
          {
            role: "user",
            content: String(prompt || ""),
          },
        ],
        temperature: groq.temperature,
        max_tokens: groq.maxTokens,
        stream: false,
        response_format: { type: "json_object" },
      }),
    });

    if (!resp.ok) {
      return {
        ok: false,
        error: `GROQ_HTTP_${resp.status}`,
        data: null,
      };
    }

    const json = await resp.json();
    const content =
      json?.choices?.[0]?.message?.content ??
      json?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    const parsed = safeJsonFromText(typeof content === "string" ? content : JSON.stringify(content || {}));

    if (!parsed || typeof parsed !== "object") {
      return {
        ok: false,
        error: "GROQ_INVALID_JSON",
        data: null,
        raw: content || null,
      };
    }

    return {
      ok: true,
      error: null,
      data: parsed,
      raw: content || null,
    };
  } catch (e) {
    if (e?.name === "AbortError") {
      return {
        ok: false,
        error: "GROQ_TIMEOUT",
        data: null,
      };
    }

    return {
      ok: false,
      error: e?.message || "GROQ_REQUEST_FAILED",
      data: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

export async function generateJson({
  prompt,
  schemaHint = null,
  timeoutMs = null,
} = {}) {
  const provider = getProvider();
  const finalTimeout = Number(timeoutMs || LLM_CONFIG.timeoutMs || 8000);
  const runner = provider === "groq" ? callGroq : callOllama;
  const out = await runner({ prompt, timeoutMs: finalTimeout });

  return {
    ...out,
    schemaHint: schemaHint || null,
  };
}
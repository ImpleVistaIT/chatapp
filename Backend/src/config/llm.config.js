function normalizeProvider(value) {
  return String(value || "").trim().toLowerCase();
}

const hasGroqKey = Boolean(String(process.env.GROQ_API_KEY || "").trim());

const provider = normalizeProvider(process.env.LLM_PROVIDER) || (hasGroqKey ? "groq" : "ollama");

const defaultTimeoutMs = Number(process.env.LLM_TIMEOUT_MS || 8000);

export const LLM_CONFIG = {
  provider,
  timeoutMs: defaultTimeoutMs,
  temperature: Number(process.env.LLM_TEMPERATURE || 0),
  numPredict: Number(process.env.LLM_NUM_PREDICT || 200),
  ollama: {
    baseUrl: String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, ""),
    url: process.env.OLLAMA_URL || "http://127.0.0.1:11434/api/generate",
    model: process.env.OLLAMA_MODEL || "llama3:latest",
    timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || defaultTimeoutMs),
  },
  groq: {
    baseUrl: String(process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1/chat/completions").trim(),
    apiKey: String(process.env.GROQ_API_KEY || "").trim(),
    model: process.env.GROQ_MODEL || "llama-3.1-8b-instant",
    timeoutMs: Number(process.env.GROQ_TIMEOUT_MS || defaultTimeoutMs),
    temperature: Number(process.env.GROQ_TEMPERATURE || process.env.LLM_TEMPERATURE || 0),
    maxTokens: Number(process.env.GROQ_MAX_TOKENS || process.env.LLM_NUM_PREDICT || 200),
  },
};

export const OLLAMA_CONFIG = {
  url: LLM_CONFIG.ollama.url,
  model: LLM_CONFIG.ollama.model,
  timeoutMs: LLM_CONFIG.ollama.timeoutMs,
  options: {
    temperature: LLM_CONFIG.temperature,
    num_predict: LLM_CONFIG.numPredict,
  },
};
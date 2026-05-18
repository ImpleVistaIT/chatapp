export const OLLAMA_CONFIG = {
  url: process.env.OLLAMA_URL || "http://localhost:11434/api/generate",
  model: process.env.OLLAMA_MODEL || "llama3:latest",
  timeoutMs: Number(process.env.OLLAMA_TIMEOUT_MS || 8000),

  options: {
    temperature: Number(process.env.OLLAMA_TEMPERATURE || 0),
    num_predict: Number(process.env.OLLAMA_NUM_PREDICT || 200),
  },
};
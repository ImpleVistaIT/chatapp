import test from "node:test";
import assert from "node:assert/strict";

import { normalizePromptWithLlm } from "../src/services/routing/promptNormalization.service.js";

test("clean prompts are also sent to Groq normalization", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
    GROQ_BASE_URL: process.env.GROQ_BASE_URL,
    GROQ_TIMEOUT_MS: process.env.GROQ_TIMEOUT_MS,
  };

  process.env.LLM_PROVIDER = "groq";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_MODEL = "llama-3.1-8b-instant";
  process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
  process.env.GROQ_TIMEOUT_MS = "2500";

  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                normalizedQuery: "show cr status",
                isMeaningful: true,
                shouldReject: false,
                confidence: 0.99,
                reason: "clean prompt preserved",
              }),
            },
          },
        ],
      }),
    };
  };

  try {
    const result = await normalizePromptWithLlm({ query: "show cr status" });

    assert.equal(result.usedLlm, true);
    assert.equal(result.normalizedQuery, "show cr status");
    assert.equal(result.rejected, false);
    assert.equal(called, true);
  } finally {
    globalThis.fetch = originalFetch;

    if (originalEnv.LLM_PROVIDER === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalEnv.LLM_PROVIDER;

    if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY;

    if (originalEnv.GROQ_MODEL === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = originalEnv.GROQ_MODEL;

    if (originalEnv.GROQ_BASE_URL === undefined) delete process.env.GROQ_BASE_URL;
    else process.env.GROQ_BASE_URL = originalEnv.GROQ_BASE_URL;

    if (originalEnv.GROQ_TIMEOUT_MS === undefined) delete process.env.GROQ_TIMEOUT_MS;
    else process.env.GROQ_TIMEOUT_MS = originalEnv.GROQ_TIMEOUT_MS;
  }
});

test("groq-backed prompt normalization fixes typos and uses the Groq chat endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
    GROQ_BASE_URL: process.env.GROQ_BASE_URL,
    GROQ_TIMEOUT_MS: process.env.GROQ_TIMEOUT_MS,
  };

  const calls = [];

  process.env.LLM_PROVIDER = "groq";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_MODEL = "llama-3.1-8b-instant";
  process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
  process.env.GROQ_TIMEOUT_MS = "2500";

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });

    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                normalizedQuery: "show po created by S4H_MM",
                isMeaningful: true,
                shouldReject: false,
                confidence: 0.97,
                reason: "typo fixed",
              }),
            },
          },
        ],
      }),
    };
  };

  try {
    const result = await normalizePromptWithLlm({ query: "showss po creatd by S4H_MM" });

    assert.equal(result.usedLlm, true);
    assert.equal(result.normalizedQuery, "show po created by S4H_MM");
    assert.equal(result.rejected, false);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, process.env.GROQ_BASE_URL);

    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.model, process.env.GROQ_MODEL);
    assert.equal(body.messages[0].role, "user");
    assert.match(body.messages[0].content, /showss po creatd by S4H_MM/);
    assert.equal(calls[0].init.headers.Authorization, "Bearer test-key");
  } finally {
    globalThis.fetch = originalFetch;

    if (originalEnv.LLM_PROVIDER === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalEnv.LLM_PROVIDER;

    if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY;

    if (originalEnv.GROQ_MODEL === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = originalEnv.GROQ_MODEL;

    if (originalEnv.GROQ_BASE_URL === undefined) delete process.env.GROQ_BASE_URL;
    else process.env.GROQ_BASE_URL = originalEnv.GROQ_BASE_URL;

    if (originalEnv.GROQ_TIMEOUT_MS === undefined) delete process.env.GROQ_TIMEOUT_MS;
    else process.env.GROQ_TIMEOUT_MS = originalEnv.GROQ_TIMEOUT_MS;
  }
});

test("groq prompt normalization repairs aliased JSON fields", async () => {
  const originalFetch = globalThis.fetch;
  const originalEnv = {
    LLM_PROVIDER: process.env.LLM_PROVIDER,
    GROQ_API_KEY: process.env.GROQ_API_KEY,
    GROQ_MODEL: process.env.GROQ_MODEL,
    GROQ_BASE_URL: process.env.GROQ_BASE_URL,
    GROQ_TIMEOUT_MS: process.env.GROQ_TIMEOUT_MS,
  };

  process.env.LLM_PROVIDER = "groq";
  process.env.GROQ_API_KEY = "test-key";
  process.env.GROQ_MODEL = "llama-3.1-8b-instant";
  process.env.GROQ_BASE_URL = "https://api.groq.com/openai/v1/chat/completions";
  process.env.GROQ_TIMEOUT_MS = "2500";

  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [
        {
          message: {
            content: "```json\n{" +
              '"normalized_query":"show cr status","meaningful":true,"reject":false,"score":0.91,"explanation":"normalized"' +
              "}\n```",
          },
        },
      ],
    }),
  });

  try {
    const result = await normalizePromptWithLlm({ query: "show cr status" });

    assert.equal(result.usedLlm, true);
    assert.equal(result.normalizedQuery, "show cr status");
    assert.equal(result.rejected, false);
    assert.equal(result.confidence, 0.91);
    assert.equal(result.reason, "normalized");
  } finally {
    globalThis.fetch = originalFetch;

    if (originalEnv.LLM_PROVIDER === undefined) delete process.env.LLM_PROVIDER;
    else process.env.LLM_PROVIDER = originalEnv.LLM_PROVIDER;

    if (originalEnv.GROQ_API_KEY === undefined) delete process.env.GROQ_API_KEY;
    else process.env.GROQ_API_KEY = originalEnv.GROQ_API_KEY;

    if (originalEnv.GROQ_MODEL === undefined) delete process.env.GROQ_MODEL;
    else process.env.GROQ_MODEL = originalEnv.GROQ_MODEL;

    if (originalEnv.GROQ_BASE_URL === undefined) delete process.env.GROQ_BASE_URL;
    else process.env.GROQ_BASE_URL = originalEnv.GROQ_BASE_URL;

    if (originalEnv.GROQ_TIMEOUT_MS === undefined) delete process.env.GROQ_TIMEOUT_MS;
    else process.env.GROQ_TIMEOUT_MS = originalEnv.GROQ_TIMEOUT_MS;
  }
});
import { authFetch } from "./authFetch";

function parseSseChunks(buffer) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remaining = parts.pop() || "";
  return { events: parts, remaining };
}

function parseSseEvent(raw) {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  let event = "message";
  let dataStr = "";

  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataStr += line.slice(5).trim();
  }

  let data = dataStr;
  try {
    data = JSON.parse(dataStr);
  } catch {}

  return { event, data };
}

export async function sendChatMessageStream(
  query,
  { apiBase, systemId, sapUser, sessionId = null, cursor = null, signal, onPhase, onReply }
) {
  // ✅ Only send sapUser when it's a real non-empty value.
  // If it's empty/undefined, backend will pick the most-recent credential for that systemId.
  const body = { query, systemId, sessionId, cursor };
  const su = String(sapUser || "").trim();
  if (su) body.sapUser = su;

  const res = await authFetch(`${apiBase}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `Stream failed (${res.status})`);
  }

  const reader = res.body?.getReader?.();
  if (!reader) throw new Error("Streaming not supported (no response body reader).");

  const decoder = new TextDecoder("utf-8");

  let buf = "";
  try {
    while (true) {
      const { value, done } = await reader.read(); // <-- will throw on abort
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      const { events, remaining } = parseSseChunks(buf);
      buf = remaining;

      for (const raw of events) {
        const { event, data } = parseSseEvent(raw);

        // debug
        console.log("[SSE]", event, data);

        if (event === "phase") onPhase?.(data);
        else if (event === "reply") onReply?.(data);
        else if (event === "error") throw new Error(data?.message || "Stream error");
        else if (event === "done") return;
      }
    }
  } catch (e) {
    // If user canceled request, propagate AbortError cleanly
    if (e?.name === "AbortError") throw e;
    throw e;
  } finally {
    try {
      await reader.cancel();
    } catch {
      // ignore
    }
  }
}
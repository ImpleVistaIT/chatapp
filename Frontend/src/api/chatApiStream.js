import { authFetch } from "./authFetch";

function parseSseChunks(buffer) {
  const normalized = buffer.replace(/\r\n/g, "\n");
  const parts = normalized.split("\n\n");
  const remaining = parts.pop() || "";
  return { events: parts, remaining };
}

function parseSseEvent(raw) {
  const lines = raw.split("\n");

  let event = "message";
  const dataLines = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith("event:")) {
      event = trimmed.slice(6).trim();
      continue;
    }

    if (trimmed.startsWith("data:")) {
      dataLines.push(trimmed.slice(5).trim());
    }
  }

  const dataStr = dataLines.join("\n");

  let data = dataStr;
  try {
    data = JSON.parse(dataStr);
  } catch {
    // keep raw string
  }

  return { event, data };
}

async function parseErrorResponse(res) {
  const text = await res.text().catch(() => "");
  if (!text) {
    return {
      message: `Stream failed (${res.status})`,
      payload: null,
    };
  }

  try {
    const json = JSON.parse(text);
    return {
      message:
        json?.message ||
        json?.error?.message ||
        json?.error ||
        `Stream failed (${res.status})`,
      payload: json,
    };
  } catch {
    return {
      message: text || `Stream failed (${res.status})`,
      payload: null,
    };
  }
}

export async function sendChatMessageStream(
  query,
  {
    apiBase,
    systemId,
    sapUser,
    sessionId = null,
    availableSystems = null,
    cursor = null,
    businessScope = "",
    pendingAction = null,
    signal,
    onPhase,
    onReply,
  }
) {
  const body = {
    query,
    systemId: systemId || null,
    sessionId,
    cursor,
  };

  const su = String(sapUser || "").trim();
  if (su) body.sapUser = su;

  const bs = String(businessScope || "").trim();
  if (bs) body.businessScope = bs;

  if (pendingAction && typeof pendingAction === "object") {
    body.pendingAction = pendingAction;
  }

  if (Array.isArray(availableSystems)) {
    body.availableSystems = availableSystems;
  }

  const res = await authFetch(`${apiBase}/chat/stream`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  if (!res.ok) {
    const { message, payload } = await parseErrorResponse(res);
    const err = new Error(message);
    err.payload = payload;
    throw err;
  }

  const reader = res.body?.getReader?.();
  if (!reader) {
    throw new Error("Streaming not supported (no response body reader).");
  }

  const decoder = new TextDecoder("utf-8");

  let buf = "";
  let gotReply = false;
  let gotDone = false;

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      const { events, remaining } = parseSseChunks(buf);
      buf = remaining;

      for (const raw of events) {
        const { event, data } = parseSseEvent(raw);

        console.log("[SSE]", event, data);

        if (event === "phase") {
          onPhase?.(data);
        } else if (event === "reply") {
          gotReply = true;
          onReply?.(data);
        } else if (event === "error") {
          const err = new Error(data?.message || "Stream error");
          err.payload = data;
          throw err;
        } else if (event === "done") {
          gotDone = true;
          return;
        }
      }
    }

    if (!gotReply && !gotDone) {
      throw new Error("Stream ended before a reply was received.");
    }
  } catch (e) {
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
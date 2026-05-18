import { authFetch } from "./authFetch";

export async function sendChatMessage(message, opts = {}) {
  const defaultWelcome = {
    ok: true,
    summary: null,
    reply: "Hi, Welcome to ImpleVista AI. How may I assist you?",
    suggestions: [
      "Show latest purchase orders",
      "Show PO created in January 2026",
      "Show details of PO 4500001933 item 00010",
    ],
  };

  const userMsg = (message ?? "").toString().toLowerCase().trim();
  if (["hi", "hello", "hey", "hi!", "hello!", "hey!"].includes(userMsg)) return defaultWelcome;
  if (userMsg === "help") return defaultWelcome;

  const base =
    import.meta.env.VITE_API_BASE_URL ||
    `${window.location.protocol}//${window.location.hostname}:3000`;

  const { signal, cursor, sessionId, onSummaryUpdate } = opts;

  let systemId = null;
  let sapUser = null;
  try {
    const active = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
    systemId = active?.systemId ? String(active.systemId).trim().toUpperCase() : null;
    sapUser = active?.sapUser ? String(active.sapUser).trim() : null;
  } catch {
    systemId = null;
    sapUser = null;
  }

  if (!systemId) {
    throw new Error("No active SAP system selected. Please connect/select a system first.");
  }

  let res;
  try {
    res = await authFetch(`${base}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal,
      body: JSON.stringify({
        query: message,
        systemId,
        sapUser: sapUser || null,
        cursor: cursor || null,
        sessionId: sessionId || null,
      }),
    });
  } catch (e) {
    throw new Error(e?.message || "Network error");
  }

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload?.error || `API error: ${res.status}`);
  }

  if (payload?.ok === false) {
    return {
      ok: false,
      summary: null,
      reply: payload?.error || "Something went wrong",
      raw: payload,
    };
  }

  const extracted = payload?.extracted || {};
  const rows = Array.isArray(payload?.data) ? payload.data : [];
  const nextCursor = payload?.cursor || null;
  const nextSessionId = payload?.sessionId || sessionId || null;

  const reply =
    typeof payload?.reply === "string" && payload.reply.trim()
      ? payload.reply
      : rows.length === 0
        ? "No results found."
        : "OK";

  if (nextSessionId) {
    localStorage.setItem("chatSessionId", String(nextSessionId));
  }

  // ✅ NEW: refresh full summary once (non-blocking)
  // Requires backend async summary to update ChatMessage.summary in DB (which you added).
  if (typeof onSummaryUpdate === "function" && nextSessionId) {
    setTimeout(async () => {
      try {
        const msgRes = await authFetch(`${base}/chat/sessions/${nextSessionId}/messages?limit=20`, {
          method: "GET",
          signal,
        });
        const msgPayload = await msgRes.json().catch(() => ({}));
        if (!msgRes.ok || msgPayload?.ok === false) return;

        const items = Array.isArray(msgPayload?.items) ? msgPayload.items : [];
        // latest assistant message in the list
        const lastAssistant = [...items].reverse().find((m) => m?.role === "assistant");
        const fullSummary =
          typeof lastAssistant?.summary === "string" ? lastAssistant.summary.trim() : "";

        if (fullSummary) onSummaryUpdate(fullSummary);
      } catch {
        // ignore refresh errors
      }
    }, 2000); // you can tune: 1500–3000ms
  }

  return {
    ok: true,
    summary: payload?.summary ?? null, // fallback comes here first
    reply,
    cursor: nextCursor,
    sessionId: nextSessionId,
    extracted,
    data: rows,
    meta: {
      sapRequest: payload?.sapRequest,
      returned: payload?.returned,
      totalMatched: payload?.totalMatched,
    },
    raw: payload,
  };
}
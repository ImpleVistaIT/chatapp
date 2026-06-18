import { authFetch } from "./authFetch";

const apiBase =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`;

async function readResponseBody(res) {
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    const json = await res.clone().json().catch(() => null);
    if (json != null) return json;
  }

  const text = await res.clone().text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
      rawText: text,
    };
  }
}

export async function sendChatMessage({
  query,
  sessionId,
  systemId,
  sapUser,
  availableSystems,
  cursor = null,
  limit = null,
  skip = null,
  fromDate = null,
  toDate = null,
}) {
  const message = String(query || "").trim();

  if (!message) {
    throw new Error("query is required");
  }

  const body = {
    query: message,
    sessionId: sessionId || null,
    systemId: systemId || null,
  };

  const su = String(sapUser || "").trim();
  if (su) {
    body.sapUser = su;
  }

  if (Array.isArray(availableSystems)) {
    body.availableSystems = availableSystems;
  }

  if (cursor) {
    body.cursor = cursor;
  }

  if (limit != null) {
    body.limit = limit;
  }

  if (skip != null) {
    body.skip = skip;
  }

  if (fromDate) {
    body.fromDate = fromDate;
  }

  if (toDate) {
    body.toDate = toDate;
  }

  const res = await authFetch(`${apiBase}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readResponseBody(res);

  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `Chat request failed (${res.status})`);
  }

  return payload;
}

export async function sendChatMessageForExport({
  query,
  sessionId,
  systemId,
  sapUser,
  availableSystems,
  cursor = null,
  limit = null,
  skip = null,
  fromDate = null,
  toDate = null,
}) {
  const message = String(query || "").trim();

  if (!message) {
    throw new Error("query is required");
  }

  const body = {
    query: message,
    sessionId: sessionId || null,
    systemId: systemId || null,
  };

  const su = String(sapUser || "").trim();
  if (su) {
    body.sapUser = su;
  }

  if (Array.isArray(availableSystems)) {
    body.availableSystems = availableSystems;
  }

  if (cursor) {
    body.cursor = cursor;
  }

  if (limit != null) {
    body.limit = limit;
  }

  if (skip != null) {
    body.skip = skip;
  }

  if (fromDate) {
    body.fromDate = fromDate;
  }

  if (toDate) {
    body.toDate = toDate;
  }

  const res = await authFetch(`${apiBase}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await readResponseBody(res);

  return {
    ok: res.ok,
    status: res.status,
    payload,
  };
}
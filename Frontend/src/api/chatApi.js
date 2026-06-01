import { authFetch } from "./authFetch";

const apiBase =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`;

export async function sendChatMessage({
  query,
  sessionId,
  systemId,
  sapUser,
  availableSystems,
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

  const res = await authFetch(`${apiBase}/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const payload = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(payload?.error || payload?.message || `Chat request failed (${res.status})`);
  }

  return payload;
}
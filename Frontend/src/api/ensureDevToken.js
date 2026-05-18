import { setAccessToken, getAccessToken } from "./client";

export async function ensureDevToken() {
  if (import.meta.env.MODE !== "development") return;

  // if we already have an in-memory token, don't fetch again
  if (getAccessToken()) return;

  const base =
    import.meta.env.VITE_API_BASE_URL ||
    `${window.location.protocol}//${window.location.hostname}:3000`;

  const res = await fetch(`${base}/auth/dev-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include", // IMPORTANT (for refresh cookie if backend sets it)
    body: JSON.stringify({ username: "dev" }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data?.accessToken) {
    throw new Error(data?.error || `Dev login failed (${res.status})`);
  }

  // store only in memory
  setAccessToken(data.accessToken);
}
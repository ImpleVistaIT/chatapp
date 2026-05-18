import { apiFetch } from "./client";

/**
 * Drop-in replacement for your old authFetch.
 * - DOES NOT read accessToken from localStorage (prevents reusing expired tokens)
 * - Uses refresh-token flow via apiFetch (refresh cookie) and retries once on 401
 */
export async function authFetch(url, options = {}) {
  const res = await apiFetch(url, options);

  // keep your old error logging behavior
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    console.error("API ERROR:", res.status, url, text);
  }

  return res;
}
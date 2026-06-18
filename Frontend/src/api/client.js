// ----------------------------
// BASE URL
// ----------------------------
export const API_BASE =
  import.meta.env.VITE_API_BASE_URL ||
  `${window.location.protocol}//${window.location.hostname}:3000`;

// ----------------------------
// Access token (in-memory only)
// ----------------------------
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token ? String(token).trim() : null;
}

export function getAccessToken() {
  return accessToken;
}

// ----------------------------
// Refresh token handler
// ----------------------------
async function refreshAccessToken() {
  const res = await fetch(`${API_BASE}/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });

  if (!res.ok) return null;

  const data = await res.json().catch(() => ({}));

  if (data?.accessToken) {
    setAccessToken(data.accessToken);
    return data.accessToken;
  }

  return null;
}

// ----------------------------
// Main API fetch wrapper
// ----------------------------
export async function apiFetch(pathOrUrl, options = {}) {
  const url =
    typeof pathOrUrl === "string" && pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${API_BASE}${pathOrUrl}`;

  const headers = new Headers(options.headers || {});

  const hasBody = options.body !== undefined && options.body !== null;

  if (
    hasBody &&
    !headers.has("Content-Type") &&
    !(options.body instanceof FormData)
  ) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`);
  }

  let res = await fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });

  if (res.status === 401) {
    const newToken = await refreshAccessToken();

    if (!newToken) return res;

    headers.set("authorization", `Bearer ${newToken}`);

    res = await fetch(url, {
      ...options,
      headers,
      credentials: "include",
    });
  }

  return res;
}
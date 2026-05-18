const API_BASE =
  (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
  "http://localhost:3000";

// Access token stays in memory (NOT localStorage)
let accessToken = null;

export function setAccessToken(token) {
  accessToken = token ? String(token).trim() : null;
}

export function getAccessToken() {
  return accessToken;
}

// Call refresh endpoint (refreshToken httpOnly cookie is sent automatically)
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

// Main API helper with auto-retry on 401
export async function apiFetch(pathOrUrl, options = {}) {
  const url =
    typeof pathOrUrl === "string" && pathOrUrl.startsWith("http")
      ? pathOrUrl
      : `${API_BASE}${pathOrUrl}`;

  const headers = new Headers(options.headers || {});

  // Only set JSON content-type when sending a body and caller didn't set it.
  // (prevents breaking FormData uploads)
  const hasBody = options.body !== undefined && options.body !== null;
  if (hasBody && !headers.has("Content-Type") && !(options.body instanceof FormData)) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("authorization", `Bearer ${accessToken}`); // keep lowercase like your backend logs
  }

  // 1st attempt
  let res = await fetch(url, {
    ...options,
    headers,
    credentials: "include", // IMPORTANT: sends refresh cookie
  });

  // If unauthorized, try refresh once, then retry original request once
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
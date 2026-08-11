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
let expiryMonitorStarted = false;
let expiryMonitorId = null;

export function setAccessToken(token) {
  accessToken = token ? String(token).trim() : null;
  startExpiryMonitor();
}

export function getAccessToken() {
  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;
}

function updateAccessTokenFromResponse(res) {
  const nextToken = res.headers.get("x-access-token");
  if (nextToken) {
    setAccessToken(nextToken);
  }
}

function decodeJwtPayload(token) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;

  try {
    const base64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function isExpiringSoon(token, thresholdSeconds = 120) {
  const payload = decodeJwtPayload(token);
  const exp = Number(payload?.exp || 0);
  if (!exp) return false;

  const remainingSeconds = exp - Math.floor(Date.now() / 1000);
  return remainingSeconds > 0 && remainingSeconds <= thresholdSeconds;
}

async function refreshTokenWithSignal() {
  const nextToken = await refreshAccessTokenOnce();

  if (!nextToken) {
    clearAccessToken();
    window.dispatchEvent(new CustomEvent("auth:expired"));
  }

  return nextToken;
}

function startExpiryMonitor() {
  if (expiryMonitorStarted) return;
  expiryMonitorStarted = true;

  expiryMonitorId = window.setInterval(() => {
    if (!accessToken || !isExpiringSoon(accessToken)) return;
    void refreshTokenWithSignal();
  }, 60_000);
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

  clearAccessToken();
  return null;
}

let refreshPromise = null;

async function refreshAccessTokenOnce() {
  if (!refreshPromise) {
    refreshPromise = refreshAccessToken().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

function isTokenErrorResponse(res, bodyText = "") {
  if (res.status !== 401) return false;

  const text = String(bodyText || "").toLowerCase();
  return text.includes("token") || text.includes("auth") || text.includes("unauthorized") || text.includes("expired");
}

async function retryWithFreshToken(url, options, headers) {
  const newToken = await refreshAccessTokenOnce();

  if (!newToken) return null;

  headers.set("authorization", `Bearer ${newToken}`);

  return fetch(url, {
    ...options,
    headers,
    credentials: "include",
  });
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

  updateAccessTokenFromResponse(res);

  if (res.status === 401 && isTokenErrorResponse(res)) {
    const retryRes = await retryWithFreshToken(url, options, headers);

    if (!retryRes) return res;

    res = retryRes;
    updateAccessTokenFromResponse(res);
  }

  return res;
}

export async function refreshAccessTokenSilently() {
  return refreshAccessTokenOnce();
}

export function stopAuthExpiryMonitor() {
  if (expiryMonitorId) {
    clearInterval(expiryMonitorId);
    expiryMonitorId = null;
  }
  expiryMonitorStarted = false;
}
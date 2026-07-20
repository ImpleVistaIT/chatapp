import { API_BASE } from "../api/client";
import { setAccessToken } from "../api/client";

// Simple redirect-based login: navigate to backend authorize endpoint
export function startLoginRedirect() {
  const redirectTo = window.location.href;
  window.location.href = `${API_BASE}/auth/authorize?redirect=${encodeURIComponent(redirectTo)}`;
}

// Provide a helper to optionally set a temporary in-memory token
export function setTempAccessToken(token) {
  setAccessToken(token);
}

export default { startLoginRedirect, setTempAccessToken };

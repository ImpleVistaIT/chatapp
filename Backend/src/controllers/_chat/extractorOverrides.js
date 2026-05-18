// ✅ NEW: Force-detect "created by <user>" even if extractor fails
export function extractUserCreatedFilter(query, allowedFields) {
  const q = String(query || "");
  const m =
    q.match(/created\s+by\s+([a-z0-9_-]+)/i) ||
    q.match(/by\s+user\s+([a-z0-9_-]+)/i) ||
    q.match(/po\s+created\s+by\s+([a-z0-9_-]+)/i) ||
    q.match(/show\s+po\s+created\s+by\s+([a-z0-9_-]+)/i);

  if (!m?.[1]) return null;

  const value = String(m[1]).trim().toUpperCase();
  if (!value) return null;

  const allowedSet = new Set((allowedFields || []).map((f) => String(f)));
  if (!allowedSet.has("UserCreated")) return null;

  return {
    field: "UserCreated",
    op: "eq",
    type: "string",
    value,
  };
}
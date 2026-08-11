// ✅ NEW: Force-detect "created by <user>" even if extractor fails
export function extractUserCreatedFilter(query, allowedFields) {
  const q = String(query || "");
  const creatorPattern =
    /(?:created\s+by|by\s+user|by\s+the\s+user|created\s+by\s+the\s+user|po\s+created\s+by|show\s+po\s+created\s+by)\s*[:=]?\s*["'`]?([a-z0-9._@-]+)["'`]?/i;
  const m = q.match(creatorPattern);

  if (!m?.[1]) return null;

  const value = String(m[1]).trim().toUpperCase();
  if (!value) return null;

  const allowedSet = new Set((allowedFields || []).map((f) => String(f)));
  if (!allowedSet.has("UserCreated")) return null;

  const normalizedQuery = q.toLowerCase();
  if (
    /\b(my\s+(?:po|pos|purchase\s*orders?))\b/i.test(q) ||
    /\b(created\s+by\s+me)\b/i.test(q) ||
    /\b(show\s+my\s+(?:po|pos|purchase\s*orders?))\b/i.test(q)
  ) {
    return {
      field: "UserCreated",
      op: "eq",
      type: "string",
      value: "ME",
    };
  }

  return {
    field: "UserCreated",
    op: "eq",
    type: "string",
    value,
  };
}
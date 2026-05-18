// --------------------
// Existing helpers (pagination intent + fingerprint)
// --------------------
export function parseNextCount(query) {
  const q = String(query || "").toLowerCase();

  const m =
    q.match(/\bnext\s*(\d{1,3})\s*(po|pos|po'?s)?\b/i) || // next 3 po / next 3pos
    q.match(/\bnext(\d{1,3})\b/i); // next3

  if (!m) return null;

  const n = Number(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;

  return Math.min(200, n);
}

export function isNextIntent(query) {
  const q = String(query || "").toLowerCase();

  return (
    /\bnext\b/.test(q) ||
    /\bmore\b/.test(q) ||
    /\banother\b/.test(q) ||
    /\bload\b/.test(q) ||
    /\bshow\s+more\b/.test(q)
  );
}

// ✅ NEW: fingerprint the query context so cursors don't leak across different filters
export function stableStringify(obj) {
  if (obj == null) return "";
  if (typeof obj !== "object") return String(obj);
  if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(",")}]`;
  const keys = Object.keys(obj).sort();
  return `{${keys.map((k) => `${k}:${stableStringify(obj[k])}`).join(",")}}`;
}

export function makeQueryFingerprint(extracted) {
  return stableStringify({
    listMode: extracted?.listMode || null,
    docNumber: extracted?.docNumber || null,
    docItem: extracted?.docItem || null,
    filters: Array.isArray(extracted?.filters) ? extracted.filters : [],
    orderBy: Array.isArray(extracted?.orderBy) ? extracted.orderBy : [],
    fields: Array.isArray(extracted?.fields) ? extracted.fields : [],
  });
}
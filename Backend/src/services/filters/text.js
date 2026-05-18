export function normalizeText(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function singularizeToken(t) {
  if (t.length > 3 && t.endsWith("s")) return t.slice(0, -1);
  return t;
}

export function tokenize(s) {
  const norm = normalizeText(s);
  if (!norm) return [];
  return norm.split(" ").map(singularizeToken).filter(Boolean);
}
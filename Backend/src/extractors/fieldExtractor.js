/**
 * Simple path extractor: "a.b.c"
 * Supports "*" for arrays: "items.*.pricing.net_price" -> array of values
 */
export function getByPath(obj, path) {
  if (!path) return undefined;

  const parts = String(path).split(".");
  let cur = obj;

  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];

    if (p === "*") {
      if (!Array.isArray(cur)) return undefined;
      const rest = parts.slice(i + 1).join(".");
      return cur.map((x) => getByPath(x, rest));
    }

    if (cur == null) return undefined;
    cur = cur[p];
  }

  return cur;
}

export function pickPaths(obj, paths = []) {
  const out = {};
  for (const p of paths) {
    out[p] = getByPath(obj, p);
  }
  return out;
}
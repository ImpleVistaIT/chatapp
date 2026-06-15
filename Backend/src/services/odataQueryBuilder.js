const ALLOWED_ODATA_PARAMS = new Set([
  "$filter",
  "$top",
  "$skip",
  "$orderby",
  "$count",
  "$select",
  "$expand",
  "$format",
]);

function asSingle(value) {
  if (Array.isArray(value)) return value[value.length - 1];
  return value;
}

export function normalizeNumericId(value, padLen = null) {
  if (value === null || value === undefined) return null;
  const digits = String(value).replace(/\D/g, "");
  if (!digits) return null;
  if (padLen == null) return digits;
  return digits.padStart(padLen, "0").slice(-padLen);
}

export function normalizePoItem(poItem) {
  return normalizeNumericId(poItem, 5);
}

export function sanitizeODataQuery(query = {}, { maxTop = 200 } = {}) {
  // Build OData query string manually to keep literal '$' in param names.
  // URLSearchParams encodes '$' as '%24', which SAP OData ignores entirely,
  // causing $orderby, $filter, $top, $skip to be silently discarded.
  const parts = [];

  for (const key of Object.keys(query || {})) {
    if (!ALLOWED_ODATA_PARAMS.has(key)) continue;

    const raw = asSingle(query[key]);
    if (raw == null || raw === "") continue;

    if (key === "$top") {
      const top = Number(raw);
      if (Number.isFinite(top) && top > 0) {
        parts.push(`$top=${String(Math.min(top, maxTop))}`);
      }
      continue;
    }

    if (key === "$skip") {
      const skip = Number(raw);
      if (Number.isFinite(skip) && skip >= 0) {
        parts.push(`$skip=${String(skip)}`);
      }
      continue;
    }

    if (key === "$count") {
      const normalized = String(raw).toLowerCase();
      if (normalized === "true" || normalized === "false") {
        parts.push(`$count=${normalized}`);
      }
      continue;
    }

    // Encode only the value, never the key — OData system params must keep literal '$'.
    parts.push(`${key}=${encodeURIComponent(String(raw))}`);
  }

  return parts.join("&");
}

export function buildEntitySetQuery(entitySet, query = {}, options = {}) {
  if (!entitySet) throw new Error("entitySet is required");
  const queryString = sanitizeODataQuery(query, options);
  return queryString ? `${entitySet}?${queryString}` : entitySet;
}

export function buildPoDetailsQuery(query = {}, options = {}) {
  return buildEntitySetQuery("Po_detailsSet", query, options);
}
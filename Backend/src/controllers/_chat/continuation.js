import { isNextIntent, parseNextCount } from "./pagination.js";

export function applyContinuationState({ query, extracted, cursor, memory }) {
  const nextIntent = isNextIntent(query);
  const requestedCount = parseNextCount(query);

  const effectiveExtracted = shouldReusePreviousExtracted({ nextIntent, extracted, memory })
    ? {
        ...memory.extracted,
        limit: extracted?.limit ?? memory?.extracted?.limit,
      }
    : extracted;

  let limit = Number(effectiveExtracted?.limit);
  if (!Number.isFinite(limit) || limit <= 0) limit = 10;
  if (requestedCount != null) limit = Math.min(200, Math.max(1, requestedCount));

  const currentFingerprint = makeSafeFingerprint(effectiveExtracted);
  const previousFingerprint = cursor?.fingerprint ? String(cursor.fingerprint) : null;
  const hasFilterChange = Boolean(previousFingerprint && previousFingerprint !== currentFingerprint);

  const prevSeen = Array.isArray(cursor?.seenPoNos) ? cursor.seenPoNos : [];
  const seenSet = new Set(prevSeen.map((x) => String(x || "").trim()).filter(Boolean));

  let rowSkip = 0;
  if (!cursor || !nextIntent || hasFilterChange) {
    rowSkip = 0;
    seenSet.clear();
  } else {
    rowSkip = Number(cursor?.rowSkip || 0);
    if (!Number.isFinite(rowSkip) || rowSkip < 0) rowSkip = 0;
  }

  return {
    nextIntent,
    requestedCount,
    limit,
    rowSkip,
    seenSet,
    currentFingerprint,
    previousFingerprint,
    hasFilterChange,
    effectiveExtracted,
  };
}

function shouldReusePreviousExtracted({ nextIntent, extracted, memory }) {
  if (!nextIntent) return false;
  if (!memory?.extracted) return false;

  const noFields = !Array.isArray(extracted?.fields) || extracted.fields.length === 0;
  const noFilters = !Array.isArray(extracted?.filters) || extracted.filters.length === 0;
  const noOrderBy = !Array.isArray(extracted?.orderBy) || extracted.orderBy.length === 0;
  const noListMode = !extracted?.listMode;
  const noDocNumber = !extracted?.docNumber;
  const noDocItem = !extracted?.docItem;

  return noFields && noFilters && noOrderBy && noListMode && noDocNumber && noDocItem;
}

function makeSafeFingerprint(extracted) {
  const fields = Array.isArray(extracted?.fields) ? extracted.fields : [];
  const filters = Array.isArray(extracted?.filters) ? extracted.filters : [];
  const orderBy = Array.isArray(extracted?.orderBy) ? extracted.orderBy : [];

  return JSON.stringify({
    docNumber: extracted?.docNumber || "",
    docItem: extracted?.docItem || "",
    fields,
    filters,
    listMode: extracted?.listMode || "",
    orderBy,
  });
}
import { extractDocQuery } from "../../services/extractor/extractor.service.js";
import { buildEntitySetQuery, normalizeNumericId } from "../../services/odataQueryBuilder.js";
import { fetchFromSap } from "../../services/sap.service.js";
import { getAllowedFieldsWithLabels } from "../../services/allowlist.service.js";
import { generateSummaryLLM } from "../../services/responseNarrator.service.js";
import { resolveServiceIntent } from "../../services/routing/serviceIntentResolver.service.js";
import {
  hasPoQuerySignals,
  hasStructuredPoRequest,
} from "../../services/extractor/extractor.service.js";

import { ChatSession } from "../../models/ChatSession.model.js";
import { SapSystem } from "../../models/SapSystem.model.js";
import { SapServiceMap } from "../../models/SapServiceMap.model.js";

import {
  buildGenericTableReply,
  getOrCreateSession,
  getSapAuthOrThrow,
  normalizeSapUser,
  normalizeSystemId,
  saveAssistantMessage,
  saveUserMessage,
  step,
  toResultsArray,
} from "./stream.shared.js";
import { loadLastAssistantMemory } from "../_chat/memory.js";
import { isNextIntent, parseNextCount } from "../_chat/pagination.js";

export function applyPoNextContinuationState({ query, extracted, previousMemory }) {
  const nextIntent = isNextIntent(query);
  const requestedNextCount = parseNextCount(query);

  const previousPoExtracted =
    previousMemory?.extracted &&
    previousMemory.extracted.docType === "PO" &&
    (previousMemory.extracted.listMode || previousMemory.extracted.orderBy || previousMemory.extracted.filters)
      ? previousMemory.extracted
      : null;

  if (!nextIntent) {
    return {
      nextIntent: false,
      requestedNextCount,
      previousPoExtracted: null,
      extracted,
      error: null,
    };
  }

  if (!previousPoExtracted) {
    return {
      nextIntent: true,
      requestedNextCount,
      previousPoExtracted: null,
      extracted,
      error: {
        message:
          "Please ask for a purchase order list first, then say 'show next 10 po' or 'show next 20 po'.",
        status: "missing_po_context",
      },
    };
  }

  const nextLimit = requestedNextCount ?? (Number(previousPoExtracted.limit) || extracted.limit || 10);
  const nextSkip = (Number(previousPoExtracted.skip) || 0) + (Number(previousPoExtracted.limit) || 10);

  return {
    nextIntent: true,
    requestedNextCount,
    previousPoExtracted,
    extracted: {
      ...extracted,
      listMode: previousPoExtracted.listMode || extracted.listMode || "latest_po",
      fields: Array.isArray(previousPoExtracted.fields) ? previousPoExtracted.fields : extracted.fields,
      filters: Array.isArray(previousPoExtracted.filters) ? previousPoExtracted.filters : extracted.filters,
      orderBy: Array.isArray(previousPoExtracted.orderBy) ? previousPoExtracted.orderBy : extracted.orderBy,
      docNumber: previousPoExtracted.docNumber ?? extracted.docNumber,
      docItem: previousPoExtracted.docItem ?? extracted.docItem,
      limit: nextLimit,
      skip: nextSkip,
    },
    error: null,
  };
}

function buildStructuredEntitySetQuery({
  entitySet,
  idField,
  idValue,
  itemField,
  itemValue,
  itemNormalizer,
  fields,
  filters,
  orderBy,
  limit,
  skip,
  count,
}) {
  const query = {};
  const filterParts = [];

  if (idValue && idField) {
    const safeValue = String(idValue).replace(/'/g, "''");
    filterParts.push(`${idField} eq '${safeValue}'`);
  }

  if (itemField && itemValue != null) {
    const normalizedItem =
      typeof itemNormalizer === "function" ? itemNormalizer(itemValue) : itemValue;

    if (normalizedItem != null && String(normalizedItem).trim()) {
      const safeValue = String(normalizedItem).replace(/'/g, "''");
      filterParts.push(`${itemField} eq '${safeValue}'`);
    }
  }

  for (const f of Array.isArray(filters) ? filters : []) {
    if (!f || typeof f !== "object") continue;

    const field = String(f.field || "").trim();
    const op = String(f.op || "").trim().toLowerCase();
    const type = String(f.type || "string").trim().toLowerCase();
    const value = f.value;

    if (!field || !op || value == null) continue;
    if (!["eq", "ne", "gt", "ge", "lt", "le"].includes(op)) continue;

    if (type === "number") {
      const n = Number(value);
      if (Number.isFinite(n)) {
        filterParts.push(`${field} ${op} ${n}`);
      }
      continue;
    }

    if (type === "boolean") {
      if (value === true || value === "true") {
        filterParts.push(`${field} ${op} true`);
      } else if (value === false || value === "false") {
        filterParts.push(`${field} ${op} false`);
      }
      continue;
    }

    if (type === "datetime") {
      let dt = String(value || "").trim();
      if (!dt) continue;

      if (/^\d{4}-\d{2}-\d{2}$/.test(dt)) {
        dt = `${dt}T00:00:00`;
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt)) {
        dt = `${dt}:00`;
      } else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}$/.test(dt)) {
        dt = dt.replace(/\.\d{3}$/, "");
      } else if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(dt)) {
        continue;
      }

      dt = dt.replace(/'/g, "''");
      filterParts.push(`${field} ${op} datetime'${dt}'`);
      continue;
    }

    const safeValue = String(value).replace(/'/g, "''").trim();
    if (!safeValue) continue;
    filterParts.push(`${field} ${op} '${safeValue}'`);
  }

  if (filterParts.length > 0) {
    query.$filter = filterParts.join(" and ");
  }

  const selectFields = Array.from(
    new Set([idField, itemField, ...(Array.isArray(fields) ? fields : [])].filter(Boolean))
  );
  if (selectFields.length > 0) {
    query.$select = selectFields.join(",");
  }

  const orderParts = [];
  for (const o of Array.isArray(orderBy) ? orderBy : []) {
    if (!o || typeof o !== "object") continue;
    const field = String(o.field || "").trim();
    if (!field) continue;
    const dir = String(o.dir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
    orderParts.push(`${field} ${dir}`);
  }
  if (orderParts.length > 0) {
    query.$orderby = orderParts.join(",");
  }

  const top = Number(limit);
  if (Number.isFinite(top) && top > 0) {
    query.$top = String(Math.min(top, 200));
  }

  const sk = Number(skip);
  if (Number.isFinite(sk) && sk >= 0) {
    query.$skip = String(sk);
  }

  if (count === true) {
    query.$count = "true";
  }

  return buildEntitySetQuery(entitySet, query, { maxTop: 200 });
}

function generateSuggestions(query, extracted, rows) {
  const q = String(query || "").toLowerCase();
  const firstRow = rows?.[0] || {};
  const docNumber = firstRow?.PoNo || extracted?.docNumber;
  const nextSize = Math.max(1, Number(extracted?.limit) || 10);

  if (q.includes("po") || q.includes("purchase") || extracted?.docNumber) {
    return [
      `show next ${nextSize} po`,
      docNumber ? `Show items of document ${docNumber}` : "Show document items",
      docNumber ? `Track document ${docNumber}` : "Track this document",
      "Show vendor details",
    ];
  }

  return [
    "Show latest purchase orders",
    "Show invoices",
    "Show reports",
  ];
}

function sanitizeStructuredFilters(filters, allowedFields) {
  const allowedSet = new Set((Array.isArray(allowedFields) ? allowedFields : []).map((f) => String(f)));
  const allowedOps = new Set(["eq", "ne", "gt", "ge", "lt", "le"]);
  const allowedTypes = new Set(["string", "number", "boolean", "datetime"]);

  const out = [];
  for (const f of Array.isArray(filters) ? filters : []) {
    if (!f || typeof f !== "object") continue;

    const field = String(f.field || "").trim();
    const op = String(f.op || "").trim().toLowerCase();
    const type = String(f.type || "string").trim().toLowerCase();
    const value = f.value;

    if (!field || !allowedSet.has(field)) continue;
    if (!allowedOps.has(op)) continue;
    if (!allowedTypes.has(type)) continue;
    if (value == null || (typeof value === "string" && !value.trim())) continue;

    out.push({ field, op, type, value });
  }

  return out;
}

// CrtDate is the confirmed SAP date field for Po_details.
// It bypasses the allowedFields/$select restriction because $orderby fields
// do not need to be in $select — they just need to exist in the entity type.
// Only CrtDate is bypassed; all others must be in allowedFields to prevent 400 errors.
const BYPASS_ORDERBY_FIELDS = new Set(["crtdate"]);

function sanitizeOrderBy(orderBy, allowedFields) {
  const allowedSet = new Set((Array.isArray(allowedFields) ? allowedFields : []).map((f) => String(f).toLowerCase()));
  const normalized = [];

  for (const o of Array.isArray(orderBy) ? orderBy : []) {
    if (!o || typeof o !== "object") continue;
    const field = String(o.field || "").trim();
    if (!field) continue;
    const fieldLower = field.toLowerCase();
    if (!allowedSet.has(fieldLower) && !BYPASS_ORDERBY_FIELDS.has(fieldLower)) continue;
    const dir = String(o.dir || "asc").trim().toLowerCase() === "desc" ? "desc" : "asc";
    normalized.push({ field, dir });
  }

  return normalized;
}

function findAllowedField(allowedFields, candidates) {
  const fields = Array.isArray(allowedFields) ? allowedFields : [];
  const byLower = new Map(fields.map((f) => [String(f).toLowerCase(), String(f)]));

  for (const name of Array.isArray(candidates) ? candidates : []) {
    const hit = byLower.get(String(name || "").toLowerCase());
    if (hit) return hit;
  }

  return null;
}

function isLatestQuery(query, extracted) {
  const q = String(query || "").toLowerCase();
  if (String(extracted?.listMode || "").toLowerCase() === "latest_po") return true;
  return /\b(latest|recent|newest|most\s+recent)\b/.test(q);
}

const LATEST_DATE_CANDIDATES = [
  "CrtDate",
  "CreatedOn",
  "PoDocDate",
  "DocDate",
  "DocumentDate",
  "ERDAT",
  "AEDAT",
];

export function enforceLatestOrderBy({ query, extracted, allowedFields, fallbackField = "" }) {
  if (!isLatestQuery(query, extracted)) return;

  // Prefer a field that exists in allowedFields (returned by $select),
  // but fall back to the hardcoded list directly — $orderby field names
  // do NOT need to be in $select; they are hardcoded safe values.
  const fieldFromAllowed = findAllowedField(allowedFields, LATEST_DATE_CANDIDATES);
  const fieldDirect = LATEST_DATE_CANDIDATES[0]; // "CrtDate" — confirmed by user
  const fallbackFromId = findAllowedField(allowedFields, [fallbackField]);

  const chosenField = fieldFromAllowed || fieldDirect || fallbackFromId;
  if (!chosenField) return;

  const existing = Array.isArray(extracted?.orderBy) ? extracted.orderBy : [];
  const rest = existing.filter(
    (o) => String(o?.field || "").toLowerCase() !== String(chosenField).toLowerCase()
  );

  extracted.orderBy = [{ field: chosenField, dir: "desc" }, ...rest];
}

function normalizeOrderBy(orderBy) {
  return (Array.isArray(orderBy) ? orderBy : [])
    .map((o) => {
      const field = String(o?.field || "").trim();
      if (!field) return null;
      const dir = String(o?.dir || "asc").toLowerCase() === "desc" ? "desc" : "asc";
      return { field, dir };
    })
    .filter(Boolean);
}

function getLatestOrderCandidates({ allowedFields, fallbackField = "" }) {
  // Only retry with fields confirmed to exist in the entity (from allowedFields/metadata).
  // Always include CrtDate as the primary bypass — it's the confirmed Po_details field.
  // Filtering against allowedFields prevents 400 errors from non-existent fields like CreatedOn.
  const inAllowed = LATEST_DATE_CANDIDATES.filter((name) =>
    findAllowedField(allowedFields, [name])
  );

  // CrtDate is always the first candidate regardless of allowedFields presence.
  const primary = "CrtDate";
  const rest = inAllowed.filter((f) => f.toLowerCase() !== primary.toLowerCase());
  if (fallbackField && !rest.includes(fallbackField)) {
    const fb = findAllowedField(allowedFields, [fallbackField]);
    if (fb) rest.push(fb);
  }

  return [primary, ...new Set(rest)];
}

function buildLatestOrderVariants({ currentOrderBy, candidates, maxVariants = 4 }) {
  const base = normalizeOrderBy(currentOrderBy);
  const variants = [];
  const seen = new Set();

  const pushVariant = (order) => {
    const normalized = normalizeOrderBy(order);
    if (normalized.length === 0) return;
    const key = JSON.stringify(normalized);
    if (seen.has(key)) return;
    seen.add(key);
    variants.push(normalized);
  };

  pushVariant(base);

  for (const field of Array.isArray(candidates) ? candidates : []) {
    const rest = base.filter((o) => String(o.field).toLowerCase() !== String(field).toLowerCase());
    pushVariant([{ field, dir: "desc" }, ...rest]);
    if (variants.length >= maxVariants) break;
  }

  return variants;
}

function parseDateValue(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  if (/^\d{8}$/.test(raw)) {
    const yyyy = Number(raw.slice(0, 4));
    const mm = Number(raw.slice(4, 6));
    const dd = Number(raw.slice(6, 8));
    const dt = new Date(yyyy, mm - 1, dd);
    return Number.isNaN(dt.getTime()) ? null : dt.getTime();
  }

  const dt = new Date(raw);
  if (!Number.isNaN(dt.getTime())) return dt.getTime();

  return null;
}

function scoreRowsFreshness(rows, dateFields) {
  const data = Array.isArray(rows) ? rows : [];
  const candidates = Array.isArray(dateFields) ? dateFields : [];
  let best = Number.NEGATIVE_INFINITY;

  for (const row of data) {
    for (const field of candidates) {
      const ts = parseDateValue(row?.[field]);
      if (Number.isFinite(ts) && ts > best) best = ts;
    }
  }

  return best;
}

function hasCurrentYearData(rows, dateFields) {
  const data = Array.isArray(rows) ? rows : [];
  const candidates = Array.isArray(dateFields) ? dateFields : [];
  const currentYear = new Date().getFullYear();

  for (const row of data) {
    for (const field of candidates) {
      const ts = parseDateValue(row?.[field]);
      if (!Number.isFinite(ts)) continue;
      if (new Date(ts).getFullYear() >= currentYear) return true;
    }
  }

  return false;
}

function resolveSelfUserFilter(filters, sapUser) {
  const currentUser = String(sapUser || "").trim();
  let unresolvedSelfRef = false;

  const normalized = (Array.isArray(filters) ? filters : []).map((f) => {
    if (!f || typeof f !== "object") return f;
    if (String(f.field || "").trim() !== "UserCreated") return f;

    const raw = String(f.value || "").trim().toLowerCase();
    const isSelfRef = raw === "me" || raw === "my" || raw === "myself" || raw === "current";
    if (!isSelfRef) return f;

    if (!currentUser) {
      unresolvedSelfRef = true;
      return f;
    }

    return {
      ...f,
      value: currentUser,
    };
  });

  return { normalized, unresolvedSelfRef };
}

export async function handleS4poChatStream({
  sse,
  owner,
  query,
  sessionId,
  systemId,
  sapUser,
}) {
  const requestedSystemId = normalizeSystemId(systemId);

  const serviceIntent = await step("resolveServiceIntent", () =>
    resolveServiceIntent({
      owner: "local",
      query,
      systemIds: requestedSystemId ? [requestedSystemId] : [],
      limitServices: 12,
    })
  );

  console.log("[SSE] resolved service intent:", serviceIntent);

  if (!serviceIntent?.matchFound || !serviceIntent?.serviceName || !serviceIntent?.entitySet) {
    sse.send("error", {
      message: "I could not match your query to any SAP service.",
      status: "service_not_found",
      serviceIntent,
    });
    return sse.end();
  }

  const routingSystemId = normalizeSystemId(serviceIntent.systemId || requestedSystemId);

  if (!routingSystemId) {
    sse.send("error", { message: "systemId is required" });
    return sse.end();
  }

  const sapAuth = await step("getSapAuthOrThrow", () =>
    getSapAuthOrThrow({
      owner,
      systemId: routingSystemId,
      sapUser,
    })
  );

  const effectiveSapUser = normalizeSapUser(sapAuth?.sapUser);
  const executionSystemId = normalizeSystemId(
    sapAuth?.matchedSystemId || requestedSystemId || routingSystemId
  );

  const session = await step("getOrCreateSession", () =>
    getOrCreateSession({
      owner,
      sessionId,
      systemId: executionSystemId,
      sapUser: effectiveSapUser,
    })
  );

  await step("save user message", () =>
    saveUserMessage({
      owner,
      sessionId: session._id,
      text: query,
    })
  );

  await step("set session title (first message only)", async () => {
    if (!session.title) {
      await ChatSession.updateOne(
        { _id: session._id },
        { $set: { title: String(query).slice(0, 80), updatedAt: new Date() } }
      );
    }
  });

  const system = await step("load SapSystem", async () => {
    return (
      (await SapSystem.findOne({
        owner: { $in: [owner, "local"] },
        systemId: executionSystemId,
      }).lean()) ||
      (await SapSystem.findOne({
        owner: { $in: [owner, "local"] },
        systemId: routingSystemId,
      }).lean())
    );
  });

  if (!system) {
    sse.send("error", {
      message: `SAP system profile not found for routingSystemId=${routingSystemId} or executionSystemId=${executionSystemId}`,
    });
    return sse.end();
  }

  const actualSystemId = normalizeSystemId(system.systemId);

  const service = await step("load SapServiceMap", async () => {
    return (
      (await SapServiceMap.findOne({
        owner: "local",
        systemId: actualSystemId,
        serviceName: serviceIntent.serviceName,
        entitySet: serviceIntent.entitySet,
      }).lean()) ||
      (await SapServiceMap.findOne({
        owner: "local",
        systemId: routingSystemId,
        serviceName: serviceIntent.serviceName,
        entitySet: serviceIntent.entitySet,
      }).lean())
    );
  });

  if (!service) {
    sse.send("error", {
      message: `Service mapping not found for executionSystemId=${actualSystemId}, routingSystemId=${routingSystemId}, serviceName=${serviceIntent.serviceName}, entitySet=${serviceIntent.entitySet}.`,
      status: "service_mapping_not_found",
      serviceIntent,
    });
    return sse.end();
  }

  const allow = await step("getAllowedFieldsWithLabels", () =>
    getAllowedFieldsWithLabels({
      system,
      service,
      entityTypeName: service.entityTypeName,
      authOverride: sapAuth,
    })
  );

  const allowedFields = allow?.fields || [];
  const fieldLabels = allow?.labels || {};

  let extracted = await step("extractDocQuery", () =>
    extractDocQuery({
      query,
      allowedFields,
      fieldLabels,
      defaultDocType: serviceIntent?.entityTypeName || service.entityTypeName || "DOCUMENT",
    })
  );

  const previousMemory = session?._id
    ? await step("loadLastAssistantMemory", () =>
        loadLastAssistantMemory({
          owner,
          sessionId: session._id,
        })
      )
    : null;

  const continuationState = applyPoNextContinuationState({ query, extracted, previousMemory });

  if (continuationState.error) {
    if (continuationState.error.status === "missing_po_context") {
      sse.send("error", {
        message: continuationState.error.message,
        status: continuationState.error.status,
      });
      return sse.end();
    }
  }

  extracted = continuationState.extracted;

  if ((!extracted.fields || extracted.fields.length === 0) && Array.isArray(serviceIntent?.fields)) {
    extracted.fields = serviceIntent.fields.filter((f) => allowedFields.includes(f));
  }

  if ((!extracted.orderBy || extracted.orderBy.length === 0) && Array.isArray(serviceIntent?.orderBy)) {
    extracted.orderBy = serviceIntent.orderBy;
  }

  if (!extracted.docNumber && serviceIntent?.docNumber) {
    extracted.docNumber = serviceIntent.docNumber;
  }

  if (!extracted.docItem && serviceIntent?.docItem) {
    extracted.docItem = serviceIntent.docItem;
  }

  if ((!extracted.limit || Number(extracted.limit) <= 0) && serviceIntent?.limit) {
    extracted.limit = serviceIntent.limit;
  }

  if ((!extracted.filters || extracted.filters.length === 0) && Array.isArray(serviceIntent?.filters)) {
    extracted.filters = serviceIntent.filters;
  }

  if (continuationState.nextIntent && continuationState.requestedNextCount != null) {
    extracted.limit = continuationState.requestedNextCount;
  }

  const { normalized: selfResolvedFilters, unresolvedSelfRef } = resolveSelfUserFilter(
    extracted.filters,
    effectiveSapUser
  );
  extracted.filters = selfResolvedFilters;

  if (unresolvedSelfRef) {
    sse.send("error", {
      message:
        "I could not determine your SAP username for the 'created by me' filter. Please provide an explicit username.",
      status: "missing_user_context",
    });
    return sse.end();
  }

  const hasSignals = hasPoQuerySignals(query);
  const hasStructuredRequest = hasStructuredPoRequest(extracted);
  if (!hasSignals && !hasStructuredRequest) {
    sse.send("error", {
      message:
        "I could not understand this purchase order request. Please ask with a PO number or filters like month/year/date and created by username.",
      status: "invalid_po_query",
    });
    return sse.end();
  }

  extracted.filters = sanitizeStructuredFilters(extracted.filters, allowedFields);
  extracted.orderBy = sanitizeOrderBy(extracted.orderBy, allowedFields);
  enforceLatestOrderBy({
    query,
    extracted,
    allowedFields,
    fallbackField: service.idField,
  });

  sse.send("phase", { phase: "fetching", message: "Fetching data from SAP..." });

  const docNumber = extracted.docNumber
    ? normalizeNumericId(extracted.docNumber, Number(service.idPad) || null)
    : null;

  const docItem = extracted.docItem
    ? normalizeNumericId(extracted.docItem, Number(service.itemPad) || null)
    : null;

  const limit = Math.min(200, Math.max(1, Number(extracted.limit) || 10));
  const skip = Number.isFinite(Number(extracted.skip)) ? Math.max(0, Number(extracted.skip)) : 0;

  const relativePath = buildStructuredEntitySetQuery({
    entitySet: service.entitySet,
    idField: service.idField,
    idValue: docNumber,
    itemField: service.itemField || null,
    itemValue: docItem,
    itemNormalizer: (v) => normalizeNumericId(v, Number(service.itemPad) || null),
    fields: extracted.fields,
    filters: extracted.filters,
    orderBy: extracted.orderBy,
    limit,
    skip,
    count: extracted.count === true,
  });

  console.log("[S4PO] extracted.orderBy before SAP fetch:", JSON.stringify(extracted.orderBy));
  console.log("[SSE] SAP relativePath:", relativePath);

  let sapData = await step("fetchFromSap", () =>
    fetchFromSap({ system, service, relativePath }, sapAuth)
  );
  let selectedRelativePath = relativePath;

  if (isLatestQuery(query, extracted) && !docNumber && !docItem) {
    const latestOrderCandidates = getLatestOrderCandidates({
      allowedFields,
      fallbackField: service.idField,
    });

    const orderVariants = buildLatestOrderVariants({
      currentOrderBy: extracted.orderBy,
      candidates: latestOrderCandidates,
      maxVariants: 4,
    });

    let bestData = sapData;
    let bestPath = selectedRelativePath;
    let bestRows = toResultsArray(sapData);
    let bestScore = scoreRowsFreshness(bestRows, latestOrderCandidates);

    for (let i = 1; i < orderVariants.length; i++) {
      const variantOrderBy = orderVariants[i];
      const variantPath = buildStructuredEntitySetQuery({
        entitySet: service.entitySet,
        idField: service.idField,
        idValue: docNumber,
        itemField: service.itemField || null,
        itemValue: docItem,
        itemNormalizer: (v) => normalizeNumericId(v, Number(service.itemPad) || null),
        fields: extracted.fields,
        filters: extracted.filters,
        orderBy: variantOrderBy,
        limit,
        skip,
        count: extracted.count === true,
      });

      const variantData = await fetchFromSap({ system, service, relativePath: variantPath }, sapAuth);
      const variantRows = toResultsArray(variantData);
      const variantScore = scoreRowsFreshness(variantRows, latestOrderCandidates);

      if (variantScore > bestScore) {
        bestScore = variantScore;
        bestData = variantData;
        bestRows = variantRows;
        bestPath = variantPath;
      }

      if (hasCurrentYearData(bestRows, latestOrderCandidates)) {
        break;
      }
    }

    sapData = bestData;
    selectedRelativePath = bestPath;
  }

  sse.send("phase", { phase: "formatting", message: "Preparing results..." });

  const safeRows = toResultsArray(sapData);

  const title =
    Array.isArray(extracted?.filters) && extracted.filters.length > 0
      ? "Filtered Results"
      : serviceIntent?.operation
      ? String(serviceIntent.operation).toUpperCase()
      : extracted?.listMode
      ? String(extracted.listMode).replace(/_/g, " ").toUpperCase()
      : "Results";

  const reply = buildGenericTableReply({
    title,
    rows: safeRows,
    fields: extracted.fields,
    startIndex: skip + 1,
  });

  const summary = await step("generateSummaryLLM", () =>
    generateSummaryLLM({
      entityLabel: service.entityTypeName || "SAP Documents",
      count: safeRows.length,
      extracted,
      sample: safeRows.slice(0, 10),
      columns: extracted.fields || [],
    })
  );

  await step("save assistant message", () =>
    saveAssistantMessage({
      owner,
      sessionId: session._id,
      text: reply,
      summary,
      extracted: { ...extracted, limit, skip },
      sapRequest: selectedRelativePath,
      data: safeRows,
      suggestions: generateSuggestions(query, extracted, safeRows),
      responseMeta: {
        ok: true,
        kind: "stream",
        returned: safeRows.length,
        routingSystemId,
        executionSystemId: actualSystemId,
        sapUser: effectiveSapUser,
        serviceName: service.serviceName,
        entitySet: service.entitySet,
      },
    })
  );

  await step("update ChatSession updatedAt", () =>
    ChatSession.updateOne({ _id: session._id }, { $set: { updatedAt: new Date() } })
  );

  sse.send("reply", {
    ok: true,
    sessionId: String(session._id),
    systemId: actualSystemId,
    routingSystemId,
    sapUser: effectiveSapUser,
    serviceName: service.serviceName,
    entitySet: service.entitySet,
    extracted: { ...extracted, limit, skip },
    sapRequest: selectedRelativePath,
    data: safeRows,
    reply,
    summary,
    returned: safeRows.length,
    suggestions: generateSuggestions(query, extracted, safeRows),
  });

  sse.send("done", { ok: true });
  return sse.end();
}
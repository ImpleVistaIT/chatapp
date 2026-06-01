import { extractDocQuery } from "../../services/extractor/extractor.service.js";
import { buildEntitySetQuery, normalizeNumericId } from "../../services/odataQueryBuilder.js";
import { fetchFromSap } from "../../services/sap.service.js";
import { getAllowedFieldsWithLabels } from "../../services/allowlist.service.js";
import { generateSummaryLLM } from "../../services/responseNarrator.service.js";
import { resolveServiceIntent } from "../../services/routing/serviceIntentResolver.service.js";

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

  if (q.includes("po") || q.includes("purchase") || extracted?.docNumber) {
    return [
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

  const extracted = await step("extractDocQuery", () =>
    extractDocQuery({
      query,
      allowedFields,
      fieldLabels,
      defaultDocType: serviceIntent?.entityTypeName || service.entityTypeName || "DOCUMENT",
    })
  );

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

  console.log("[SSE] SAP relativePath:", relativePath);

  const sapData = await step("fetchFromSap", () =>
    fetchFromSap({ system, service, relativePath }, sapAuth)
  );

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
      sapRequest: relativePath,
      data: safeRows,
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
    sapRequest: relativePath,
    data: safeRows,
    reply,
    summary,
    returned: safeRows.length,
    suggestions: generateSuggestions(query, extracted, safeRows),
  });

  sse.send("done", { ok: true });
  return sse.end();
}
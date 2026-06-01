import { buildExecutionConfirmation } from "./confirmationBuilder.service.js";
import { getOwner } from "../../controllers/_chat/auth.js";
import { resolveSapConnection } from "../sap/sapConnectionResolver.service.js";
import {
  createSolmanChangeRequest,
  getSolmanChangeRequestDetailsById,
  listSolmanChangeRequestsByDateRange,
} from "../systems/solman/charm.service.js";

import { extractDocQuery } from "../extractor/extractor.service.js";
import { getAllowedFieldsWithLabels } from "../allowlist.service.js";
import { fetchFromSap } from "../sap.service.js";
import { buildEntitySetQuery, normalizeNumericId } from "../odataQueryBuilder.js";
import { SapServiceMap } from "../../models/SapServiceMap.model.js";

function toResultsArray(sapData) {
  const results = sapData?.d?.results;
  return Array.isArray(results) ? results : [];
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

async function executeSolmanCreateChangeRequest({ payload, req }) {
  const owner = getOwner(req);

  const systemId =
    payload?.systemId ||
    req?.body?.systemId ||
    req?.userContext?.systemId ||
    null;

  const sapUser =
    payload?.sapUser ||
    req?.body?.sapUser ||
    req?.userContext?.sapUser ||
    null;

  if (!systemId) {
    const err = new Error("systemId is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  if (!sapUser) {
    const err = new Error("sapUser is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const connection = await resolveSapConnection({
    owner,
    systemId,
    sapUser,
  });

  return await createSolmanChangeRequest({
    system: connection.system,
    sapAuth: connection.sapAuth,
    payload,
  });
}

async function executeSolmanGetChangeRequestDetails({ payload, req }) {
  const owner = getOwner(req);

  const systemId =
    payload?.systemId ||
    req?.body?.systemId ||
    req?.userContext?.systemId ||
    null;

  const sapUser =
    payload?.sapUser ||
    req?.body?.sapUser ||
    req?.userContext?.sapUser ||
    null;

  const objectId =
    payload?.objectId ||
    payload?.changeRequestId ||
    null;

  const processType = payload?.processType || "YMHF";

  if (!systemId) {
    const err = new Error("systemId is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  if (!sapUser) {
    const err = new Error("sapUser is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  if (!objectId) {
    const err = new Error("objectId is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const connection = await resolveSapConnection({
    owner,
    systemId,
    sapUser,
  });

  return await getSolmanChangeRequestDetailsById({
    system: connection.system,
    sapAuth: connection.sapAuth,
    objectId,
    processType,
  });
}

async function executeSolmanListChangeRequests({ payload, req }) {
  const owner = getOwner(req);

  const systemId =
    payload?.systemId ||
    req?.body?.systemId ||
    req?.userContext?.systemId ||
    null;

  const sapUser =
    payload?.sapUser ||
    req?.body?.sapUser ||
    req?.userContext?.sapUser ||
    null;

  const fromDate = payload?.fromDate || null;
  const toDate = payload?.toDate || null;
  const processType = payload?.processType || "YMHF";
  const triggerAll = payload?.triggerAll || "X";

  if (!systemId) {
    const err = new Error("systemId is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  if (!sapUser) {
    const err = new Error("sapUser is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  if (!fromDate) {
    const err = new Error("fromDate is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  if (!toDate) {
    const err = new Error("toDate is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const connection = await resolveSapConnection({
    owner,
    systemId,
    sapUser,
  });

  return await listSolmanChangeRequestsByDateRange({
    system: connection.system,
    sapAuth: connection.sapAuth,
    processType,
    fromDate,
    toDate,
    triggerAll,
  });
}

async function executeS4hanaListPurchaseOrders({ payload, req }) {
  const owner = getOwner(req);

  const systemId =
    payload?.systemId ||
    req?.body?.systemId ||
    req?.userContext?.systemId ||
    null;

  const sapUser =
    payload?.sapUser ||
    req?.body?.sapUser ||
    req?.userContext?.sapUser ||
    null;

  const query =
    payload?.query ||
    req?.body?.query ||
    "Show latest purchase orders";

  if (!systemId) {
    const err = new Error("systemId is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  if (!sapUser) {
    const err = new Error("sapUser is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const connection = await resolveSapConnection({
    owner,
    systemId,
    sapUser,
  });

  const service = await SapServiceMap.findOne({
    owner: "local",
    systemId,
    serviceType: "PO",
  }).lean();

  if (!service) {
    const err = new Error("Service mapping not found (PO).");
    err.status = 404;
    throw err;
  }

  const allow = await getAllowedFieldsWithLabels({
    system: connection.system,
    service,
    entityTypeName: service.entityTypeName,
    authOverride: connection.sapAuth,
  });

  const extracted = await extractDocQuery({
    query,
    allowedFields: allow?.fields || [],
    fieldLabels: allow?.labels || {},
    defaultDocType: "PO",
  });

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

  const sapData = await fetchFromSap(
    {
      system: connection.system,
      service,
      relativePath,
    },
    connection.sapAuth
  );

  return {
    query,
    extracted: { ...extracted, limit, skip },
    sapRequest: relativePath,
    data: toResultsArray(sapData),
    returned: toResultsArray(sapData).length,
  };
}

const EXECUTOR_MAP = {
  "solman.charm.createChangeRequest": executeSolmanCreateChangeRequest,
  "solman.charm.getChangeRequestDetails": executeSolmanGetChangeRequestDetails,
  "solman.charm.listChangeRequests": executeSolmanListChangeRequests,
  "s4hana.mm.listPurchaseOrders": executeS4hanaListPurchaseOrders,
};

export async function executeResolvedAction({ resolvedActionResponse, req = null }) {
  const executorKey = resolvedActionResponse?.action?.executor;
  const payload = resolvedActionResponse?.action?.payload || {};
  const routing = resolvedActionResponse?.routing || {};

  const executor = EXECUTOR_MAP[executorKey];

  if (!executor) {
    return {
      ok: true,
      status: "ready_for_executor",
      message: `Execution is not wired yet for ${executorKey}.`,
      routing,
      action: resolvedActionResponse?.action || { type: "execute_api" },
      execution: {
        executor: executorKey,
        payload,
      },
    };
  }

  const executionResult = await executor({
    payload,
    req,
    routing,
  });

  return buildExecutionConfirmation({
    routing,
    action: resolvedActionResponse.action,
    executionResult,
  });
}
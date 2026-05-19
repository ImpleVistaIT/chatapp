import mongoose from "mongoose";
import { extractDocQuery } from "../services/extractor/extractor.service.js";
import { buildEntitySetQuery, normalizeNumericId } from "../services/odataQueryBuilder.js";
import { fetchFromSap } from "../services/sap.service.js";
import { getAllowedFieldsWithLabels } from "../services/allowlist.service.js";
import { generateSummaryLLM } from "../services/responseNarrator.service.js";

import { ChatSession } from "../models/ChatSession.model.js";
import { ChatMessage } from "../models/ChatMessage.model.js";

import { SapCredential } from "../models/SapCredential.model.js";
import { decryptString } from "../utils/crypto.js";

import { SapSystem } from "../models/SapSystem.model.js";
import { SapServiceMap } from "../models/SapServiceMap.model.js";

// Helpers
function getOwner(req) {
  const owner = String(req.user?.id || "").trim();
  if (!owner) {
    const e = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
  return owner;
}

function normalizeSystemId(systemId) {
  return String(systemId || "").trim().toUpperCase();
}

function normalizeSapUser(sapUser) {
  const s = String(sapUser || "").trim();
  return s ? s : null;
}

async function getOrCreateSession({ owner, sessionId, systemId, sapUser }) {
  const sid = normalizeSystemId(systemId);
  const su = normalizeSapUser(sapUser);

  if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
    const q = { _id: sessionId, owner, systemId: sid };
    if (su) q.sapUser = su;
    const existing = await ChatSession.findOne(q);
    if (existing) return existing;
  }

  return ChatSession.create({
    owner,
    systemId: sid,
    sapUser: su,
    title: "",
    sapConnectionId: null,
    updatedAt: new Date(),
  });
}

async function getSapAuthOrThrow({ owner, systemId, sapUser }) {
  const sid = normalizeSystemId(systemId);
  const su = normalizeSapUser(sapUser);

  console.log("[SSE] getSapAuthOrThrow", { owner, systemId: sid, sapUser: su });

  const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  const cred = su
    ? await SapCredential.findOne({
        owner,
        systemId: sid,
        sapUser: { $regex: `^${escapeRegex(su)}$`, $options: "i" },
      }).select({
        sapUser: 1,
        encPassword: 1,
        encIv: 1,
        encTag: 1,
      })
    : await SapCredential.findOne({ owner, systemId: sid })
        .sort({ lastUsedAt: -1, updatedAt: -1 })
        .select({
          sapUser: 1,
          encPassword: 1,
          encIv: 1,
          encTag: 1,
        });

  console.log("[SSE] credential found?", Boolean(cred));

  if (!cred) {
    const e = new Error(
      su
        ? `No SAP credentials saved for systemId=${sid} sapUser=${su}. Please login first.`
        : `No SAP credentials saved for systemId=${sid}. Please login first.`
    );
    e.status = 401;
    throw e;
  }

  const username = String(cred.sapUser || "").trim();
  const password = decryptString({ enc: cred.encPassword, iv: cred.encIv, tag: cred.encTag });

  if (!username || !password) {
    const e = new Error("Saved credentials are invalid.");
    e.status = 500;
    throw e;
  }

  await SapCredential.updateOne({ _id: cred._id }, { $set: { lastUsedAt: new Date() } });

  return { username, password };
}

function toResultsArray(sapData) {
  const results = sapData?.d?.results;
  return Array.isArray(results) ? results : [];
}

function na(v) {
  if (v == null) return "N/A";
  if (typeof v === "string") return v.trim() ? v.trim() : "N/A";
  return String(v);
}

function formatFieldName(fieldName) {
  return String(fieldName || "")
    .replace(/^_+/, "")
    .replace(/__/g, "_")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function buildGenericTableReply({ title = "Results", rows = [], fields = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) return "No results found.";

  const first = rows[0] && typeof rows[0] === "object" ? rows[0] : {};
  const keys = Object.keys(first).filter((k) => k !== "__metadata");

  const base = Array.isArray(fields) && fields.length > 0 ? fields.filter((f) => keys.includes(f)) : [];
  const common = ["CrtDate", "UserCreated", "SuppAcoutNo", "NetPrice", "CurKey"].filter((k) => keys.includes(k));
  const baseOrCommon = base.length > 0 ? base : common.length > 0 ? common : keys.slice(0, 8);

  const mandatoryIds = [
    ...(keys.includes("PoNo") ? ["PoNo"] : []),
    ...(keys.includes("PoItem") ? ["PoItem"] : []),
  ];
  const cols = Array.from(new Set([...mandatoryIds, ...baseOrCommon]));

  const headerRow = ["#", ...cols.map((c) => formatFieldName(c))].join(" | ");
  const dataRows = rows.map((r, i) => [i + 1, ...cols.map((k) => na(r?.[k]))].join(" | "));

  return `${title} (returned ${rows.length})\n\n${headerRow}\n${dataRows.join("\n")}`;
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
  const poNumber = firstRow?.PoNo || extracted?.docNumber;

  if (q.includes("po") || extracted?.docNumber) {
    return [
      poNumber ? `Show items of PO ${poNumber}` : "Show PO items",
      poNumber ? `Track PO ${poNumber}` : "Track this PO",
      "Show vendor details",
    ];
  }

  return [
    "Show latest purchase orders",
    "Show invoices",
    "Show reports",
  ];
}

export async function handleChatStream(req, res) {
  res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  const send = (event, data) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    res.flush?.();
  };

  const ping = setInterval(() => {
    res.write(`event: ping\n`);
    res.write(`data: {}\n\n`);
    res.flush?.();
  }, 15000);

  let closed = false;

  const markClosed = (reason) => {
    if (closed) return;
    closed = true;
    console.log("[SSE] stream closed:", reason);
    clearInterval(ping);
  };

  req.on("aborted", () => markClosed("req.aborted"));
  res.on("close", () => markClosed("res.close"));
  res.on("finish", () => markClosed("res.finish"));

  const step = async (label, fn) => {
    console.log(`[SSE] ${label}...`);
    const t0 = Date.now();
    const out = await fn();
    console.log(`[SSE] ${label} done in ${Date.now() - t0}ms`);
    return out;
  };

  try {
    const owner = getOwner(req);
    const { query, sessionId, systemId, sapUser } = req.body;

    if (!query) {
      send("error", { message: "query is required" });
      clearInterval(ping);
      return res.end();
    }

    const sid = normalizeSystemId(systemId);
    if (!sid) {
      send("error", { message: "systemId is required" });
      clearInterval(ping);
      return res.end();
    }

    const su = normalizeSapUser(sapUser);

    console.log("[SSE] start", { owner, systemId: sid, sapUser: su, sessionId, hasCursor: false });

    send("phase", { phase: "extracting", message: "Interpreting your query..." });

    const session = await step("getOrCreateSession", () =>
      getOrCreateSession({ owner, sessionId, systemId: sid, sapUser: su })
    );

    await step("save user message", () =>
      ChatMessage.create({
        owner,
        sessionId: session._id,
        role: "user",
        text: String(query),
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

    const sapAuth = await step("getSapAuthOrThrow", () => getSapAuthOrThrow({ owner, systemId: sid, sapUser: su }));

    const system = await step("load SapSystem", () => SapSystem.findOne({ owner: "local", systemId: sid }).lean());
    if (!system) {
      send("error", { message: `SAP system profile not found for systemId=${sid}` });
      clearInterval(ping);
      return res.end();
    }

    const service = await step("load SapServiceMap", () =>
      SapServiceMap.findOne({ owner: "local", systemId: sid, serviceType: "PO" }).lean()
    );
    if (!service) {
      send("error", { message: "Service mapping not found (PO)." });
      clearInterval(ping);
      return res.end();
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
        defaultDocType: "PO",
      })
    );

    console.log("[SSE] extracted:", JSON.stringify(extracted, null, 2));
    console.log("[SSE] closed after extract?", closed);
    if (closed) {
      clearInterval(ping);
      return;
    }

    send("phase", { phase: "fetching", message: "Fetching data from SAP..." });

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

    if (closed) {
      clearInterval(ping);
      return;
    }

    send("phase", { phase: "formatting", message: "Preparing results..." });

    const safeRows = toResultsArray(sapData);

    const title =
      Array.isArray(extracted?.filters) && extracted.filters.length > 0
        ? "Filtered Results"
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
        entityLabel: "Purchase Orders",
        count: safeRows.length,
        extracted,
        sample: safeRows.slice(0, 10),
        columns: extracted.fields || [],
      })
    );

    await step("save assistant message", () =>
      ChatMessage.create({
        owner,
        sessionId: session._id,
        role: "assistant",
        text: reply,
        summary,
        extracted: { ...extracted, limit, skip },
        sapRequest: relativePath,
        data: safeRows,
        responseMeta: { ok: true, kind: "stream", returned: safeRows.length },
      })
    );

    await step("update ChatSession updatedAt", () =>
      ChatSession.updateOne({ _id: session._id }, { $set: { updatedAt: new Date() } })
    );

    console.log("[SSE] sending reply event");
    send("reply", {
      ok: true,
      sessionId: String(session._id),
      extracted: { ...extracted, limit, skip },
      sapRequest: relativePath,
      data: safeRows,
      reply,
      summary,
      returned: safeRows.length,
      suggestions: generateSuggestions(query, extracted, safeRows),
    });

    send("done", { ok: true });
    clearInterval(ping);
    return res.end();
  } catch (e) {
    console.error("[SSE] error:", e);
    send("error", { message: e?.message || "Internal error" });
    clearInterval(ping);
    return res.end();
  }
}
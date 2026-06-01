import mongoose from "mongoose";

import { extractDocQuery } from "../services/extractor/extractor.service.js";
import { buildEntitySetQuery, normalizeNumericId } from "../services/odataQueryBuilder.js";
import { fetchFromSap } from "../services/sap.service.js";
import { getAllowedFieldsWithLabels } from "../services/allowlist.service.js";
import { classifyPrompt } from "../services/routing/promptClassifier.service.js";
import { resolveTargetSystem } from "../services/routing/systemContextResolver.service.js";
import { resolveServiceIntent } from "../services/routing/serviceIntentResolver.service.js";

import { ChatSession } from "../models/ChatSession.model.js";
import { ChatMessage } from "../models/ChatMessage.model.js";

import { SapSystem } from "../models/SapSystem.model.js";
import { SapServiceMap } from "../models/SapServiceMap.model.js";
import { generateSummaryLLM } from "../services/responseNarrator.service.js";

import { getOwner, normalizeSystemId, normalizeSapUser } from "./_chat/auth.js";
import { getOrCreateSession } from "./_chat/sessionStore.js";
import { getSapAuthOrThrow } from "./_chat/sapAuth.js";
import { extractUserCreatedFilter } from "./_chat/extractorOverrides.js";
import { isNextIntent } from "./_chat/pagination.js";
import { applyContinuationState } from "./_chat/continuation.js";
import {
  loadLastAssistantMemory,
  tryAnswerFromMemory,
} from "./_chat/memory.js";
import { applyFollowUpMemory } from "./_chat/followUpMemory.js";
import { computeTableColumns, buildGenericTableReply } from "./_chat/replyFormat.js";

// helper: enforce allowlist exists
function assertAllowlist({ allowedFields, fieldLabels, context }) {
  if (!Array.isArray(allowedFields) || allowedFields.length === 0) {
    const e = new Error(
      `Unable to load SAP metadata allowlist (${context}). Check serviceName/entityTypeName mapping in SapServiceMap.`
    );
    e.status = 400;
    throw e;
  }
  if (!fieldLabels || typeof fieldLabels !== "object") return;
}

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

function generateSuggestions(query, extracted, rows) {
  const q = String(query || "").toLowerCase();

  if (q.includes("purchase order") || q.includes("po")) {
    return [
      "Show latest purchase orders",
      "Show PO created in January 2026",
      "Show details of PO 4500001933 item 00010",
    ];
  }

  if (Array.isArray(rows) && rows.length > 0) {
    const firstPo = rows[0]?.PoNo ? String(rows[0].PoNo).trim() : "";
    if (firstPo) {
      return [
        `Show details of PO ${firstPo}`,
        `Show PO ${firstPo} item 00010`,
        "Show more results",
      ];
    }
  }

  return [
    "Show latest purchase orders",
    "Show PO created by IRAM",
    "Show details of PO 4500001933",
  ];
}

// ------------------------
// DB-backed sessions/messages endpoints
// ------------------------

export async function listChatSessions(req, res) {
  try {
    const owner = getOwner(req);

    const systemId = normalizeSystemId(req.query?.systemId);
    const sapUser = normalizeSapUser(req.query?.sapUser);

    const limitRaw = Number(req.query?.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;

    const before = req.query?.before ? new Date(String(req.query.before)) : null;

    const q = { owner };
    if (systemId) q.systemId = systemId;
    if (sapUser) q.sapUser = sapUser;

    if (before && !Number.isNaN(before.getTime())) {
      q.updatedAt = { $lt: before };
    }

    const items = await ChatSession.find(q)
      .sort({ updatedAt: -1 })
      .limit(limit + 1)
      .select({ title: 1, createdAt: 1, updatedAt: 1, systemId: 1, sapUser: 1 })
      .lean();

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    const nextBefore = hasMore ? page[page.length - 1]?.updatedAt : null;

    return res.json({
      ok: true,
      items: page.map((s) => ({
        _id: String(s._id),
        title: s.title || "New chat",
        systemId: s.systemId || null,
        sapUser: s.sapUser || null,
        createdAt: s.createdAt || null,
        updatedAt: s.updatedAt || null,
      })),
      nextBefore: nextBefore ? new Date(nextBefore).toISOString() : null,
    });
  } catch (e) {
    return res.status(e?.status || 500).json({ ok: false, error: e?.message || "Failed to list sessions" });
  }
}

export async function listChatMessages(req, res) {
  try {
    const owner = getOwner(req);

    const sessionId = String(req.params.sessionId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId" });
    }

    const session = await ChatSession.findOne({ _id: sessionId, owner }).select({ _id: 1 });
    if (!session) return res.status(404).json({ ok: false, error: "Session not found" });

    const limitRaw = Number(req.query?.limit ?? 20);
    const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, limitRaw)) : 20;

    const before = req.query?.before ? new Date(String(req.query.before)) : null;

    const q = { owner, sessionId };
    if (before && !Number.isNaN(before.getTime())) {
      q.createdAt = { $lt: before };
    }

    const items = await ChatMessage.find(q)
      .sort({ createdAt: -1 })
      .limit(limit + 1)
      .select({ role: 1, text: 1, summary: 1, data: 1, createdAt: 1 })
      .lean();

    const hasMore = items.length > limit;
    const pageNewestFirst = hasMore ? items.slice(0, limit) : items;
    const pageOldestFirst = [...pageNewestFirst].reverse();

    return res.json({
      ok: true,
      items: pageOldestFirst.map((m) => ({
        _id: String(m._id),
        role: m.role,
        text: m.text || "",
        summary: m.summary || null,
        data: m.data || null,
        createdAt: m.createdAt || null,
      })),
    });
  } catch (e) {
    return res.status(e?.status || 500).json({ ok: false, error: e?.message || "Failed to list messages" });
  }
}

export async function renameChatSession(req, res) {
  try {
    const owner = getOwner(req);

    const sessionId = String(req.params.sessionId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId" });
    }

    const title = String(req.body?.title || "").trim();
    if (!title) return res.status(400).json({ ok: false, error: "title is required" });

    await ChatSession.updateOne({ _id: sessionId, owner }, { $set: { title, updatedAt: new Date() } });
    return res.json({ ok: true });
  } catch (e) {
    return res.status(e?.status || 500).json({ ok: false, error: e?.message || "Rename failed" });
  }
}

export async function deleteChatSession(req, res) {
  try {
    const owner = getOwner(req);

    const sessionId = String(req.params.sessionId || "").trim();
    if (!mongoose.Types.ObjectId.isValid(sessionId)) {
      return res.status(400).json({ ok: false, error: "Invalid sessionId" });
    }

    await Promise.all([
      ChatMessage.deleteMany({ owner, sessionId }),
      ChatSession.deleteOne({ owner, _id: sessionId }),
    ]);

    return res.json({ ok: true });
  } catch (e) {
    return res.status(e?.status || 500).json({ ok: false, error: e?.message || "Delete failed" });
  }
}

/**
 * Common handler used by PO (and future doc types).
 * PO controller passes: defaultDocType="PO", docTypeFast="PO"
 */
export async function handleDocChat({ req, res, defaultDocType, docTypeFast }) {
  try {
    const owner = getOwner(req);

    const { query, cursor, sessionId, systemId, sapUser, availableSystems } = req.body;
    if (!query) return res.status(400).json({ ok: false, error: "query is required" });

    let sid = normalizeSystemId(systemId);
    let systemResolution = null;

    const classified = await classifyPrompt({
      query,
      sessionContext: null,
    });

    if (!sid) {
      systemResolution = await resolveTargetSystem({
        query,
        classified,
        requestedSystemId: systemId,
        availableSystems: Array.isArray(availableSystems) ? availableSystems : [],
      });

      if (systemResolution.status === "disconnected") {
        return res.status(200).json({
          ok: true,
          status: "disconnected_system",
          message: `The system ${systemResolution.targetSystemId} is disconnected. Please connect it and try again.`,
          missingFields: [],
          systemResolution,
        });
      }

      if (systemResolution.status === "ambiguous") {
        return res.status(200).json({
          ok: true,
          status: "needs_input",
          message:
            systemResolution.candidates.length > 0
              ? `I found multiple possible systems for this request: ${systemResolution.candidates.join(", ")}. Please specify which system to use.`
              : "I could not determine which system to use. Please specify the system.",
          missingFields: ["systemId"],
          systemResolution,
        });
      }

      if (systemResolution.status === "unknown") {
        return res.status(200).json({
          ok: true,
          status: "needs_input",
          message: "I could not determine the target system from your request. Please specify the system.",
          missingFields: ["systemId"],
          systemResolution,
        });
      }

      sid = normalizeSystemId(systemResolution.targetSystemId);
    }

    const serviceIntent = await resolveServiceIntent({
      owner: "local",
      query,
      systemIds: sid ? [sid] : [],
      limitServices: 12,
    });

    console.log("[CHAT] resolved service intent:", serviceIntent);

    if (serviceIntent?.matchFound && serviceIntent?.systemId) {
      const intentSid = normalizeSystemId(serviceIntent.systemId);

      if (intentSid && intentSid !== sid) {
        console.log("[CHAT] system override from service intent", {
          previousSystemId: sid,
          intentSystemId: intentSid,
        });
        sid = intentSid;
      }
    }

    if (!sid) {
      return res.status(200).json({
        ok: true,
        status: "needs_input",
        message: "I could not determine the target system from your request. Please specify the system.",
        missingFields: ["systemId"],
        systemResolution,
        serviceIntent,
      });
    }

    const session = await getOrCreateSession({ owner, sessionId, systemId: sid, sapUser });

    await ChatSession.updateOne(
      { _id: session._id },
      {
        $set: {
          currentSystemType: "s4hana",
          routingSource: "handler",
          lastClassifiedAt: new Date(),
          updatedAt: new Date(),
        },
      }
    );

    await ChatMessage.create({
      owner,
      sessionId: session._id,
      role: "user",
      text: String(query),
    });

    const sapAuth = await getSapAuthOrThrow({ owner, systemId: sid, sapUser });

    const system = await SapSystem.findOne({ owner: { $in: [owner, "local"] }, systemId: sid }).lean();
    if (!system) {
      return res.status(400).json({ ok: false, error: `SAP system profile not found for systemId=${sid}` });
    }

    const service = await SapServiceMap.findOne({
      owner: { $in: [owner, "local"] },
      systemId: sid,
      ...(serviceIntent?.serviceName && serviceIntent?.entitySet
        ? {
            serviceName: serviceIntent.serviceName,
            entitySet: serviceIntent.entitySet,
          }
        : {
            serviceType: docTypeFast,
          }),
    }).lean();

    if (!service) {
      return res.status(400).json({
        ok: false,
        error: `Service mapping not found for systemId=${sid} ${serviceIntent?.serviceName ? `serviceName=${serviceIntent.serviceName} entitySet=${serviceIntent.entitySet}` : `serviceType=${docTypeFast}`} (configure serviceName/entitySet/entityTypeName).`,
      });
    }

    const { fields: allowedFields, labels: fieldLabels } = await getAllowedFieldsWithLabels({
      system,
      service,
      entityTypeName: service.entityTypeName,
      authOverride: sapAuth,
    });

    assertAllowlist({
      allowedFields,
      fieldLabels,
      context: `${sid} ${service.serviceType} ${service.serviceName} EntityType=${service.entityTypeName}`,
    });

    const extracted = await extractDocQuery({
      query,
      allowedFields,
      fieldLabels,
      defaultDocType,
    });
    console.log("🧠 EXTRACTOR OUTPUT:", JSON.stringify(extracted, null, 2));

    const explicitLimitRaw = req.body?.limit ?? req.query?.limit;
    const explicitLimit = Number(explicitLimitRaw);
    if (Number.isFinite(explicitLimit) && explicitLimit > 0) {
      extracted.limit = Math.min(200, Math.max(1, explicitLimit));
    }

    const userFilter = extractUserCreatedFilter(query, allowedFields);
    if (userFilter) {
      extracted.filters = Array.isArray(extracted.filters) ? extracted.filters : [];
      extracted.filters.push(userFilter);
    }

    console.log("🔍 EXTRACTED FILTERS:", extracted.filters);
    const memory = await loadLastAssistantMemory({ owner, sessionId: session._id });

    const followUpState = applyFollowUpMemory({
      query,
      extracted,
      memory,
      service,
    });

    const isListQuery = followUpState.isListQuery;

    const memoryAnswer = !isListQuery
      ? tryAnswerFromMemory({
          query,
          memory,
          allowedFields,
          fieldLabels,
          extracted,
          idField: service.idField,
        })
      : null;

    if (memoryAnswer) {
      await ChatMessage.create({
        owner,
        sessionId: session._id,
        role: "assistant",
        text: memoryAnswer,
        responseMeta: { ok: true, kind: "memory_answer" },
      });

      await ChatSession.updateOne({ _id: session._id }, { $set: { updatedAt: new Date() } });

      return res.json({
        ok: true,
        sessionId: String(session._id),
        extracted,
        reply: memoryAnswer,
        fromMemory: true,
      });
    }

    const hasFilters = Array.isArray(extracted.filters) && extracted.filters.length > 0;
    const hasOrderBy = Array.isArray(extracted.orderBy) && extracted.orderBy.length > 0;
    const hasLimit = extracted.limit != null && Number.isFinite(Number(extracted.limit)) && Number(extracted.limit) > 0;
    const hasFields = Array.isArray(extracted.fields) && extracted.fields.length > 0;

    const shouldFetch =
      Boolean(extracted.listMode) ||
      Boolean(extracted.docNumber) ||
      hasFilters ||
      hasOrderBy ||
      hasLimit ||
      isNextIntent(query) ||
      (hasFields && !!memory);

    if (!shouldFetch) {
      const reply = "No SAP fetch needed for this query.";
      await ChatMessage.create({
        owner,
        sessionId: session._id,
        role: "assistant",
        text: reply,
        extracted,
        responseMeta: { ok: true, kind: "no_fetch" },
      });

      await ChatSession.updateOne({ _id: session._id }, { $set: { updatedAt: new Date() } });

      return res.json({
        ok: true,
        sessionId: String(session._id),
        extracted,
        reply,
      });
    }

    const continuation = applyContinuationState({
      query,
      extracted,
      cursor,
      memory,
    });

    if (continuation.effectiveExtracted && continuation.effectiveExtracted !== extracted) {
      extracted.docNumber = continuation.effectiveExtracted.docNumber ?? extracted.docNumber;
      extracted.docItem = continuation.effectiveExtracted.docItem ?? extracted.docItem;
      extracted.fields = continuation.effectiveExtracted.fields ?? extracted.fields;
      extracted.filters = continuation.effectiveExtracted.filters ?? extracted.filters;
      extracted.orderBy = continuation.effectiveExtracted.orderBy ?? extracted.orderBy;
      extracted.listMode = continuation.effectiveExtracted.listMode ?? extracted.listMode;
    }

    let limit = continuation.limit;
    let rowSkip = continuation.rowSkip;
    const currentFp = continuation.currentFingerprint;

    const docNumber = extracted.docNumber
      ? normalizeNumericId(extracted.docNumber, Number(service.idPad) || null)
      : null;

    const docItem = extracted.docItem
      ? normalizeNumericId(extracted.docItem, Number(service.itemPad) || null)
      : null;

    console.log("🔴 FILTERS SENT TO SAP:", JSON.stringify(extracted.filters, null, 2));

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
      skip: rowSkip,
      count: extracted.count === true,
    });

    const sapRequest = relativePath;
    console.log("🔴 QUERY:", relativePath);

    const sapData = await fetchFromSap(
      {
        system,
        service,
        relativePath,
      },
      sapAuth
    );

    const safePage = toResultsArray(sapData);
    rowSkip += safePage.length;

    const title =
      Array.isArray(extracted?.filters) && extracted.filters.length > 0
        ? "Filtered Results"
        : extracted?.listMode
          ? String(extracted.listMode).replace(/_/g, " ").toUpperCase()
          : "Results";

    const reply = buildGenericTableReply({
      title,
      rows: safePage,
      fields: extracted.fields,
    });

    const count = safePage.length;
    const entityLabel = "Purchase Orders";
    const fallbackSummary = `Here are ${count} ${entityLabel}.`;

    const responsePayload = {
      ok: true,
      sessionId: String(session._id),
      summary: fallbackSummary,
      suggestions: generateSuggestions(query, extracted, safePage),
      cursor: {
        rowSkip,
        fingerprint: currentFp,
      },
      extracted: {
        ...extracted,
        systemId: sid,
        docNumber,
        docItem,
        limit,
        skip: rowSkip,
      },
      sapRequest,
      data: safePage,
      reply,
      returned: safePage.length,
    };

    const assistantMsg = await ChatMessage.create({
      owner,
      sessionId: session._id,
      role: "assistant",
      text: reply,
      summary: fallbackSummary,
      suggestions: generateSuggestions(query, extracted, safePage),
      extracted: responsePayload.extracted,
      sapRequest: responsePayload.sapRequest,
      data: safePage,
      responseMeta: { returned: safePage.length, summaryStatus: "pending" },
    });

    await ChatSession.updateOne({ _id: session._id }, { $set: { updatedAt: new Date() } });

    res.json(responsePayload);

    setImmediate(() => {
      const cols = computeTableColumns({ rows: safePage, fields: extracted.fields });

      const sample = safePage.slice(0, 5).map((r) => {
        const o = {};
        for (const c of cols) o[c] = r?.[c];
        return o;
      });

      generateSummaryLLM({ entityLabel, count, extracted, sample, columns: cols })
        .then(async (fullSummary) => {
          const s = String(fullSummary || "").trim();
          if (!s) return;

          await ChatMessage.updateOne(
            { _id: assistantMsg._id },
            { $set: { summary: s, "responseMeta.summaryStatus": "done" } }
          );
        })
        .catch(async (e) => {
          await ChatMessage.updateOne(
            { _id: assistantMsg._id },
            {
              $set: {
                "responseMeta.summaryStatus": "failed",
                "responseMeta.summaryError": e?.message || String(e),
              },
            }
          );
        });
    });

    return;
  } catch (err) {
    console.log("❌ CONTROLLER ERROR:", err);
    console.log("❌ STACK:", err?.stack);
    const status = err?.status || 500;
    return res.status(status).json({
      ok: false,
      error: err?.message || "Internal Server Error",
    });
  }
}
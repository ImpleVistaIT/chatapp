import { classifyPrompt } from "../services/routing/promptClassifier.service.js";
import { resolveTargetSystem } from "../services/routing/systemContextResolver.service.js";
import { SapCredential } from "../models/SapCredential.model.js";
import { ChatMessage } from "../models/ChatMessage.model.js";
import { SapConnection } from "../models/SapConnection.model.js";

import {
  createSseSession,
  getOwner,
  normalizeSystemId,
  step,
} from "./stream/stream.shared.js";

import { handleS4poChatStream } from "./stream/s4po.stream.controller.js";
import { handleSolmanChatStream } from "./stream/solman.stream.controller.js";

function cleanString(v) {
  return String(v || "").trim();
}

function isNextPageQuery(query) {
  return /\b(?:show\s+)?next\s+\d+\b/.test(cleanString(query).toLowerCase());
}

function isLandscapeOnlyQuery(query) {
  const q = cleanString(query).toUpperCase();
  return q === "ROW" || q === "INDIA";
}

function scopeToProcessType(scope) {
  const s = cleanString(scope).toUpperCase();
  if (s === "ROW") return "YMHF";
  if (s === "INDIA") return "YMH1";
  return "";
}

function isSolmanCrQuery(query) {
  const q = cleanString(query).toLowerCase();

  if (!q) return false;
  if (isNextPageQuery(q)) return true;

  const hasCrContext =
    /\bcr\b/.test(q) ||
    /\bchange request\b/.test(q) ||
    /\bchange requests\b/.test(q) ||
    /\bcr list\b/.test(q) ||
    /\bstatus of cr\b/.test(q) ||
    /\bstatus of each change request\b/.test(q) ||
    /\bshow the status of the cr\b/.test(q) ||
    /\bopen cr\b/.test(q) ||
    /\bclosed cr\b/.test(q) ||
    /\bapproved cr\b/.test(q) ||
    /\brejected cr\b/.test(q) ||
    /\bpending cr\b/.test(q) ||
    /\bdependency transport\b/.test(q) ||
    /\bdependency transports\b/.test(q) ||
    /\btransport created cr\b/.test(q) ||
    /\btransports created cr\b/.test(q) ||
    /\bcreated by me\b/.test(q) ||
    /\bcreated by\b/.test(q) ||
    /\bmy cr\b/.test(q) ||
    /\bmy crs\b/.test(q) ||
    /\bmy change request\b/.test(q) ||
    /\bmy change requests\b/.test(q);

  if (!hasCrContext) return false;

  const patterns = [
    /\b(?:show\s+)?next\s+\d+\b/,
    /\bcr\b/,
    /\bchange request\b/,
    /\bchange requests\b/,
    /\bcr list\b/,
    /\bstatus of cr\b/,
    /\bstatus of each change request\b/,
    /\bshow the status of the cr\b/,
    /\bopen cr\b/,
    /\bclosed cr\b/,
    /\bapproved cr\b/,
    /\brejected cr\b/,
    /\bpending cr\b/,
    /\bdependency transport\b/,
    /\bdependency transports\b/,
    /\btransport created cr\b/,
    /\btransports created cr\b/,
    /\blast\s+\d+\s+cr\b/,
    /\blast\s+\d+\s+cr\s+status\b/,
    /\bthis month\b/,
    /\blast month\b/,
    /\bthis week\b/,
    /\bthis year\b/,
    /\bin the month of\b/,
    /\bmonth of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/,
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/,
    /\bin the year of\s+\d{4}\b/,
    /\byear of\s+\d{4}\b/,
    /\bin\s+20\d{2}\b/,
    /\bcreated by me\b/,
    /\bcreated by myself\b/,
    /\bshow my cr\b/,
    /\bshow my crs\b/,
    /\bmy cr\b/,
    /\bmy crs\b/,
    /\bmy change request\b/,
    /\bmy change requests\b/,
    /\bcreated by\s+[a-z0-9._-]+\b/i,
  ];

  return patterns.some((re) => re.test(q));
}

function resolveSolmanSystemId({ systemResolution, systemId }) {
  const resolvedFromRouting = normalizeSystemId(systemResolution?.targetSystemId);
  if (resolvedFromRouting) return resolvedFromRouting;

  const resolvedFromRequest = normalizeSystemId(systemId);
  if (resolvedFromRequest) return resolvedFromRequest;

  return "";
}

function buildSolmanSystemError(systemResolution) {
  const hasTargetEndpoint =
    cleanString(systemResolution?.targetEndpoint?.host) &&
    cleanString(systemResolution?.targetEndpoint?.port);

  if (hasTargetEndpoint) {
    return {
      message:
        "The required SAP system could not be matched from your current system list. Please add or refresh the correct system to continue.",
      status: "needs_input",
      missingFields: ["systemId"],
      systemResolution,
      action: {
        type: "add_system",
        label: "Add System",
      },
    };
  }

  return {
    message: "This system isn’t added yet. Please add it to continue.",
    status: "needs_input",
    missingFields: ["systemId"],
    systemResolution,
    action: {
      type: "add_system",
      label: "Add System",
    },
  };
}

async function resolveSolmanSapUser({ owner, systemId, requestedSapUser }) {
  const resolvedSystemId = normalizeSystemId(systemId);
  const normalizedRequested = cleanString(requestedSapUser);

  if (!resolvedSystemId) return "";

  if (normalizedRequested) {
    const exact = await SapCredential.findOne({
      owner,
      systemId: resolvedSystemId,
      sapUser: normalizedRequested,
    })
      .sort({ lastUsedAt: -1, updatedAt: -1 })
      .lean();

    if (exact) return normalizedRequested;
  }

  const latest = await SapCredential.findOne({
    owner,
    systemId: resolvedSystemId,
  })
    .sort({ lastUsedAt: -1, updatedAt: -1, createdAt: -1 })
    .lean();

  return latest?.sapUser || "";
}
async function findLastSolmanListContext({ owner, sessionId }) {
  if (!sessionId) return null;

  const lastAssistant = await ChatMessage.findOne({
    owner,
    sessionId,
    role: "assistant",
    "extracted.system": "solman",
    "extracted.intent": {
      $in: ["list_change_requests", "list_change_requests_by_created_by"],
    },
  })
    .sort({ createdAt: -1 })
    .lean();

  if (!lastAssistant) return null;

  const pendingAction =
    lastAssistant?.responseMeta?.pendingAction ||
    lastAssistant?.data?.pendingAction ||
    null;
  const extractedPending = Boolean(lastAssistant?.extracted?.pending);
  const hasPagination =
    Boolean(lastAssistant?.responseMeta?.pagination) ||
    Number.isFinite(Number(pendingAction?.filters?.nextSkip)) ||
    Number.isFinite(Number(pendingAction?.filters?.skip));

  const originalQuery = cleanString(pendingAction?.query);

  // Only restore if we have a real pending action or a truly paginated response.
  // Do not restore from final assistant summaries like "Found 8 change request(s)."
  if (!originalQuery && !extractedPending && !hasPagination) {
    return null;
  }

  const filters =
    pendingAction?.filters ||
    lastAssistant?.responseMeta?.pagination ||
    lastAssistant?.extracted?.filters ||
    null;

  if (!filters) return null;

  return {
    system: "solman",
    intent: cleanString(lastAssistant?.extracted?.intent || pendingAction?.intent || "list_change_requests"),
    query: originalQuery,
    pending: extractedPending || Boolean(pendingAction),
    filters: {
      businessScope: cleanString(filters.businessScope || ""),
      processType: cleanString(filters.processType || ""),
      status: cleanString(filters.status || ""),
      dateText: cleanString(filters.dateText || originalQuery || ""),
      triggerAll: cleanString(filters.triggerAll || "X") || "X",
      createdBy: cleanString(filters.createdBy || ""),
      createdByMode: cleanString(filters.createdByMode || ""),
      top: filters.top ?? null,
      skip: filters.skip ?? 0,
      nextSkip: filters.nextSkip ?? 0,
      displayOffset: filters.displayOffset ?? 0,
      nextDisplayOffset: filters.nextDisplayOffset ?? filters.displayOffset ?? 0,
      orderBy: cleanString(filters.orderBy || "CREATED_ON desc") || "CREATED_ON desc",
      fromDate: cleanString(filters.fromDate || ""),
      toDate: cleanString(filters.toDate || ""),
      statusMode: cleanString(filters.statusMode || ""),
      excludeStatuses: Array.isArray(filters.excludeStatuses)
        ? filters.excludeStatuses
        : [],
    },
  };
}

async function withLiveConnectionFlags({ owner, availableSystems }) {
  const systems = Array.isArray(availableSystems) ? availableSystems : [];
  if (systems.length === 0) return systems;

  const activeConnections = await SapConnection.find({
    owner,
    revokedAt: null,
    expiresAt: { $gt: new Date() },
  })
    .select({ systemId: 1 })
    .lean();

  const connectedSidSet = new Set(
    activeConnections
      .map((c) => normalizeSystemId(c?.systemId))
      .filter(Boolean)
  );

  if (connectedSidSet.size === 0) return systems;

  return systems.map((item) => {
    const sid = normalizeSystemId(item?.systemId || item?.id || item?.code);
    if (!sid || !connectedSidSet.has(sid)) return item;

    return {
      ...item,
      connected: true,
      isConnected: true,
      status: "connected",
      active: true,
    };
  });
}

export async function handleChatStream(req, res) {
  const sse = createSseSession(res);

  try {
    const owner = getOwner(req);
    const {
      query,
      sessionId,
      systemId,
      sapUser,
      availableSystems,
      businessScope,
      pendingAction,
    } = req.body || {};

    const effectiveAvailableSystems = await step("withLiveConnectionFlags", () =>
      withLiveConnectionFlags({
        owner,
        availableSystems: Array.isArray(availableSystems) ? availableSystems : [],
      })
    );

    console.log("[SSE] incoming body:", {
      query,
      sessionId,
      systemId,
      sapUser,
      businessScope,
      pendingAction,
    });

    if (!query) {
      sse.send("error", { message: "query is required" });
      return sse.end();
    }

    sse.send("phase", {
      phase: "routing",
      message: "Understanding your request...",
    });

    const queryIsNextPage = isNextPageQuery(query);
    const queryIsLandscapeOnly = isLandscapeOnlyQuery(query);

    let effectivePendingAction = pendingAction || null;

    if (!effectivePendingAction && sessionId) {
      effectivePendingAction = await step("findLastSolmanListContext", () =>
        findLastSolmanListContext({
          owner,
          sessionId,
        })
      );

      console.log("[SSE] recovered last SolMan list context:", effectivePendingAction);
    }

    const pendingSystem = cleanString(effectivePendingAction?.system).toLowerCase();
    const pendingIntent = cleanString(effectivePendingAction?.intent).toLowerCase();

    const supportedPendingIntents = new Set([
      "list_change_requests",
      "list_change_requests_by_created_by",
    ]);

    const hasValidPagination =
      Number.isFinite(Number(effectivePendingAction?.filters?.skip)) ||
      Number.isFinite(Number(effectivePendingAction?.filters?.nextSkip));

    const shouldRestorePendingSolman =
      Boolean(effectivePendingAction) &&
      pendingSystem === "solman" &&
      supportedPendingIntents.has(pendingIntent) &&
      (
        queryIsNextPage ||
        (queryIsLandscapeOnly && hasValidPagination)
      );

    if (shouldRestorePendingSolman) {
      const pendingFilters = effectivePendingAction?.filters || {};

      const restoredScope = queryIsLandscapeOnly
        ? cleanString(query).toUpperCase()
        : cleanString(businessScope || "");

      const restoredProcessType = queryIsLandscapeOnly
        ? scopeToProcessType(restoredScope)
        : cleanString(pendingFilters.processType);

      console.log("[SSE] restoring pending SolMan action:", {
        businessScope: restoredScope,
        processType: restoredProcessType,
        originalQuery: effectivePendingAction?.query,
        queryIsNextPage,
        queryIsLandscapeOnly,
      });

      const restoredSystemResolution = await step(
        "resolveTargetSystem (restored SolMan)",
        () =>
          resolveTargetSystem({
            query: cleanString(effectivePendingAction?.query) || "show cr list",
            classified: {
              system: "solman",
              intent: pendingIntent,
              routing: {
                system: "solman",
                intent: pendingIntent,
              },
            },
            requestedSystemId: systemId,
            availableSystems: effectiveAvailableSystems,
          })
      );

      const resolvedSystemId = resolveSolmanSystemId({
        systemResolution: restoredSystemResolution,
        systemId,
      });

      console.log(
        "[SSE] resolved system for restored SolMan action:",
        resolvedSystemId || "(none)"
      );
      console.log(
        "[SSE] restored SolMan system resolution detail:",
        restoredSystemResolution
      );

      if (!resolvedSystemId) {
        sse.send("error", buildSolmanSystemError(restoredSystemResolution));
        return sse.end();
      }

      const resolvedSapUser = await step("resolveSolmanSapUser", () =>
        resolveSolmanSapUser({
          owner,
          systemId: resolvedSystemId,
          requestedSapUser: sapUser,
        })
      );

      console.log(
        "[SSE] resolved sapUser for restored SolMan action:",
        resolvedSapUser || "(none)"
      );

      if (!resolvedSapUser) {
        sse.send("error", {
          message: `No SAP credentials saved for systemId=${resolvedSystemId}. Please login to Solution Manager first.`,
          status: "missing_solman_credentials",
          missingFields: ["sapUser"],
        });
        return sse.end();
      }

      const restoredQuery = cleanString(
        queryIsNextPage
          ? effectivePendingAction?.query || "show cr list"
          : queryIsLandscapeOnly
            ? effectivePendingAction?.query || "show cr list"
            : query || effectivePendingAction?.query
      );

      const restoredClassified = {
        intent: pendingIntent,
        system: "solman",
        entities: {
          businessScope:
            restoredScope ||
            cleanString(pendingFilters.businessScope),
          processType:
            restoredProcessType ||
            cleanString(pendingFilters.processType),
          status: cleanString(pendingFilters.status),
          dateText: cleanString(pendingFilters.dateText || effectivePendingAction?.query),
          triggerAll: cleanString(pendingFilters.triggerAll || "X") || "X",
          createdBy: cleanString(pendingFilters.createdBy),
          createdByMode: cleanString(pendingFilters.createdByMode),
          top: queryIsNextPage ? null : pendingFilters.top ?? null,
          skip: queryIsNextPage
            ? pendingFilters.nextSkip ?? pendingFilters.skip ?? 0
            : pendingFilters.skip ?? 0,
          nextSkip: pendingFilters.nextSkip ?? 0,
          displayOffset: queryIsNextPage
            ? pendingFilters.nextDisplayOffset ?? pendingFilters.displayOffset ?? 0
            : pendingFilters.displayOffset ?? 0,
          nextDisplayOffset: pendingFilters.nextDisplayOffset ?? pendingFilters.displayOffset ?? 0,
          orderBy:
            cleanString(pendingFilters.orderBy || "CREATED_ON desc") ||
            "CREATED_ON desc",
          fromDate: cleanString(pendingFilters.fromDate),
          toDate: cleanString(pendingFilters.toDate),
          statusMode: cleanString(pendingFilters.statusMode),
          excludeStatuses: Array.isArray(pendingFilters.excludeStatuses)
            ? pendingFilters.excludeStatuses
            : [],
        },
      };

      if (queryIsLandscapeOnly && !restoredClassified.entities.processType) {
        restoredClassified.entities.processType = scopeToProcessType(restoredScope);
      }

      console.log("[SSE] dispatching restored pending action to SolMan stream handler");

      return await handleSolmanChatStream({
        sse,
        owner,
        query: restoredQuery,
        sessionId,
        systemId: resolvedSystemId,
        sapUser: resolvedSapUser,
        classified: restoredClassified,
        systemResolution: {
          ...restoredSystemResolution,
          status: "resolved",
          targetSystemId: resolvedSystemId,
          source: "pending_solman_action",
        },
      });
    }

    const classified = await step("classifyPrompt", () =>
      classifyPrompt({
        query,
        sessionContext: null,
      })
    );

    const forcedSolman =
      isSolmanCrQuery(query) ||
      cleanString(classified?.system).toLowerCase() === "solman";

    if (forcedSolman) {
      console.log("[SSE] forcing SolMan routing based on CR query pattern");
    }

    const systemResolution = await step("resolveTargetSystem", () =>
      resolveTargetSystem({
        query,
        classified,
        requestedSystemId: systemId,
        availableSystems: effectiveAvailableSystems,
      })
    );

    const useSolman = forcedSolman || classified?.system === "solman";

    if (systemResolution.status === "disconnected") {
      sse.send("error", {
        message: `The system ${
          systemResolution.targetSystemId || "target"
        } is disconnected. Please connect it and try again.`,
        status: "disconnected_system",
        action: {
          type: "reconnect_system",
          label: systemResolution.targetSystemId
            ? `Connect ${systemResolution.targetSystemId}`
            : "Connect system",
          systemId: systemResolution.targetSystemId || null,
        },
        systemResolution,
      });
      return sse.end();
    }

    if (systemResolution.status === "ambiguous" && !useSolman) {
      sse.send("error", {
        message:
          systemResolution.candidates.length > 0
            ? `I found multiple possible systems for this request: ${systemResolution.candidates.join(
                ", "
              )}. Please specify which system to use.`
            : "I could not determine which system to use. Please specify the system.",
        status: "needs_input",
        missingFields: ["systemId"],
        systemResolution,
      });
      return sse.end();
    }

    let resolvedSystemId = normalizeSystemId(
      systemResolution.targetSystemId || systemId
    );

    let resolvedSapUser = cleanString(sapUser);

    if (useSolman) {
      resolvedSystemId = resolveSolmanSystemId({
        systemResolution,
        systemId,
      });

      console.log("[SSE] resolved system for SolMan:", resolvedSystemId || "(none)");
      console.log("[SSE] SolMan system resolution detail:", systemResolution);

      if (!resolvedSystemId) {
        sse.send("error", buildSolmanSystemError(systemResolution));
        return sse.end();
      }

      resolvedSapUser = await step("resolveSolmanSapUser", () =>
        resolveSolmanSapUser({
          owner,
          systemId: resolvedSystemId,
          requestedSapUser: sapUser,
        })
      );

      console.log("[SSE] resolved sapUser for SolMan:", resolvedSapUser || "(none)");

      if (!resolvedSapUser) {
        sse.send("error", {
          message: `No SAP credentials saved for systemId=${resolvedSystemId}. Please login to Solution Manager first.`,
          status: "missing_solman_credentials",
          missingFields: ["sapUser"],
        });
        return sse.end();
      }
    }

    const context = {
      sse,
      owner,
      query,
      sessionId,
      systemId: resolvedSystemId,
      sapUser: resolvedSapUser,
      classified: useSolman
        ? { ...classified, system: "solman" }
        : classified,
      systemResolution,
    };

    if (useSolman) {
      console.log("[SSE] dispatching to SolMan stream handler");
      return await handleSolmanChatStream(context);
    }

    console.log("[SSE] dispatching to S4PO stream handler");
    return await handleS4poChatStream(context);
  } catch (e) {
    console.error("[SSE] error:", e);

    sse.send("error", {
      message: e?.userMessage || e?.message || "Internal error",
      status: e?.status || "internal_error",
      code: e?.code || "internal_error",
      missingFields: Array.isArray(e?.missingFields) ? e.missingFields : [],
      action: e?.action || null,
    });

    return sse.end();
  }
}
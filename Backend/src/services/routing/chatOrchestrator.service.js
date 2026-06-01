import { classifyPrompt } from "./promptClassifier.service.js";
import { validateRoutingResult } from "./routingValidator.service.js";
import { resolveRoutingAction } from "./actionResolver.service.js";
import { executeResolvedAction } from "./executor.service.js";
import { resolveTargetSystem } from "./systemContextResolver.service.js";
import {
  buildPendingAction,
  mergePendingActionData,
  updatePendingActionMissingFields,
} from "./pendingAction.service.js";
import { buildNeedsInputResponse } from "./chatResponse.service.js";
import {
  setSessionPendingAction,
  clearSessionPendingAction,
} from "../chat/chatSessionPending.service.js";

function getMissingFields(validated) {
  if (Array.isArray(validated?.missingFields)) return validated.missingFields;
  if (Array.isArray(validated?.validation?.missingFields)) {
    return validated.validation.missingFields;
  }
  return [];
}

function getCollectedFields(validated) {
  if (validated?.collected && typeof validated.collected === "object") {
    return validated.collected;
  }
  if (validated?.entities && typeof validated.entities === "object") {
    return validated.entities;
  }
  if (validated?.params && typeof validated.params === "object") {
    return validated.params;
  }
  return {};
}

function buildResumeQuery({ pendingAction, query }) {
  const originalQuery = String(pendingAction?.originalQuery || "").trim();
  const nextQuery = String(query || "").trim();

  if (!originalQuery) return nextQuery;
  if (!nextQuery) return originalQuery;

  return `${originalQuery}\n${nextQuery}`;
}

function applyResolvedSystemIdToAction(resolved, systemId) {
  if (!resolved || !systemId) return resolved;

  return {
    ...resolved,
    action: {
      ...(resolved.action || {}),
      payload: {
        ...((resolved.action && resolved.action.payload) || {}),
        systemId,
      },
    },
  };
}

export async function orchestrateChatRequest({
  query,
  sessionContext = null,
  req = null,
}) {
  const sessionId = sessionContext?.session?._id || null;
  const existingPendingAction = sessionContext?.session?.pendingAction || null;

  const effectiveQuery = existingPendingAction
    ? buildResumeQuery({
        pendingAction: existingPendingAction,
        query,
      })
    : query;

  const classified = await classifyPrompt({
    query: effectiveQuery,
    sessionContext,
  });

  const availableSystems = Array.isArray(req?.body?.availableSystems)
    ? req.body.availableSystems
    : [];

  const incomingSystemId = String(req?.body?.systemId || "").trim();
  let resolvedSystemId = incomingSystemId || null;
  let systemResolution = null;

  if (!incomingSystemId && availableSystems.length > 0) {
    systemResolution = await resolveTargetSystem({
      query: effectiveQuery,
      classified,
      requestedSystemId: incomingSystemId,
      availableSystems,
    });

    if (systemResolution.status === "disconnected") {
      return {
        ok: false,
        status: "disconnected_system",
        message: `The system ${systemResolution.targetSystemId} is disconnected. Please connect it and try again.`,
        routing: classified,
        systemResolution,
      };
    }

    if (systemResolution.status === "ambiguous") {
      return {
        ok: true,
        status: "needs_input",
        message:
          systemResolution.candidates.length > 0
            ? `I found multiple possible systems for this request: ${systemResolution.candidates.join(", ")}. Please specify which system to use.`
            : "I could not determine which system to use. Please specify the system.",
        routing: classified,
        systemResolution,
        missingFields: ["systemId"],
      };
    }

    if (systemResolution.status === "unknown") {
      return {
        ok: true,
        status: "needs_input",
        message:
          "I could not determine the target system from your request. Please specify the system.",
        routing: classified,
        systemResolution,
        missingFields: ["systemId"],
      };
    }

    if (systemResolution.status === "resolved") {
      resolvedSystemId = systemResolution.targetSystemId;
      req.body.systemId = resolvedSystemId;
    }
  }

  const validated = validateRoutingResult(classified);
  let resolved = resolveRoutingAction(validated);

  if (resolvedSystemId) {
    resolved = applyResolvedSystemIdToAction(resolved, resolvedSystemId);
  }

  const extractedFields = getCollectedFields(validated);
  const missingFields = getMissingFields(validated);

  if (existingPendingAction) {
    const mergedPendingAction = updatePendingActionMissingFields(
      mergePendingActionData(existingPendingAction, extractedFields),
      missingFields
    );

    if (missingFields.length > 0) {
      if (sessionId) {
        await setSessionPendingAction(sessionId, mergedPendingAction);
      }

      return buildNeedsInputResponse({
        message: resolved?.message || "More information is required to continue.",
        actionType: mergedPendingAction.actionType || "open_form",
        formId: mergedPendingAction.formId || null,
        pendingAction: mergedPendingAction,
        missingFields,
      });
    }

    if (sessionId) {
      await clearSessionPendingAction(sessionId);
    }

    if (resolved?.action?.type === "execute_api") {
      const executionResponse = await executeResolvedAction({
        resolvedActionResponse: resolved,
        req,
      });

      return {
        ...executionResponse,
        ...(systemResolution ? { systemResolution } : {}),
      };
    }

    return {
      ...resolved,
      resumedFromPendingAction: true,
      collected: mergedPendingAction.collected || {},
      ...(systemResolution ? { systemResolution } : {}),
    };
  }

  if (missingFields.length > 0) {
    const pendingAction = buildPendingAction({
      intent:
        validated?.intent ||
        classified?.intent ||
        resolved?.intent ||
        "unknown_intent",
      executor: resolved?.action?.executor || null,
      actionType: resolved?.action?.type || "open_form",
      formId: resolved?.action?.formId || null,
      collected: extractedFields,
      missingFields,
      originalQuery: query,
    });

    if (sessionId) {
      await setSessionPendingAction(sessionId, pendingAction);
    }

    return buildNeedsInputResponse({
      message: resolved?.message || "More information is required to continue.",
      actionType: pendingAction.actionType,
      formId: pendingAction.formId,
      pendingAction,
      missingFields,
      ...(systemResolution ? { systemResolution } : {}),
    });
  }

  if (sessionId) {
    await clearSessionPendingAction(sessionId);
  }

  if (resolved?.action?.type === "execute_api") {
    const executionResponse = await executeResolvedAction({
      resolvedActionResponse: resolved,
      req,
    });

    return {
      ...executionResponse,
      ...(systemResolution ? { systemResolution } : {}),
    };
  }

  return {
    ...resolved,
    ...(systemResolution ? { systemResolution } : {}),
  };
}
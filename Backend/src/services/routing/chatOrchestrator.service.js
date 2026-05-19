import { classifyPrompt } from "./promptClassifier.service.js";
import { validateRoutingResult } from "./routingValidator.service.js";
import { resolveRoutingAction } from "./actionResolver.service.js";
import { executeResolvedAction } from "./executor.service.js";
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

export async function orchestrateChatRequest({ query, sessionContext = null, req = null }) {
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

  const validated = validateRoutingResult(classified);
  const resolved = resolveRoutingAction(validated);

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
      return executeResolvedAction({
        resolvedActionResponse: resolved,
        req,
      });
    }

    return {
      ...resolved,
      resumedFromPendingAction: true,
      collected: mergedPendingAction.collected || {},
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
    });
  }

  if (sessionId) {
    await clearSessionPendingAction(sessionId);
  }

  if (resolved?.action?.type === "execute_api") {
    return executeResolvedAction({
      resolvedActionResponse: resolved,
      req,
    });
  }

  return resolved;
}
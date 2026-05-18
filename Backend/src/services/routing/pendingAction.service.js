function cleanArray(values) {
  if (!Array.isArray(values)) return [];
  return values
    .map((v) => String(v || "").trim())
    .filter(Boolean);
}

export function buildPendingAction({
  intent,
  executor,
  actionType = "open_form",
  formId = null,
  collected = {},
  missingFields = [],
  originalQuery = "",
}) {
  return {
    intent: String(intent || "").trim(),
    executor: String(executor || "").trim(),
    actionType: String(actionType || "open_form").trim(),
    formId: formId ? String(formId).trim() : null,
    collected: collected && typeof collected === "object" ? collected : {},
    missingFields: cleanArray(missingFields),
    originalQuery: String(originalQuery || "").trim(),
    status: "awaiting_input",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

export function mergePendingActionData(pendingAction, newValues = {}) {
  return {
    ...(pendingAction || {}),
    collected: {
      ...((pendingAction && pendingAction.collected) || {}),
      ...(newValues && typeof newValues === "object" ? newValues : {}),
    },
    updatedAt: new Date().toISOString(),
  };
}

export function updatePendingActionMissingFields(pendingAction, missingFields = []) {
  return {
    ...(pendingAction || {}),
    missingFields: cleanArray(missingFields),
    updatedAt: new Date().toISOString(),
  };
}

export function markPendingActionComplete(pendingAction) {
  return {
    ...(pendingAction || {}),
    status: "completed",
    updatedAt: new Date().toISOString(),
  };
}

export function clearPendingAction(session) {
  if (!session) return session;
  session.pendingAction = null;
  return session;
}
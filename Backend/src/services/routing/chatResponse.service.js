export function buildNeedsInputResponse({
  message = "More information is required to continue.",
  actionType = "open_form",
  formId = null,
  pendingAction = null,
  missingFields = [],
}) {
  return {
    ok: true,
    status: "needs_input",
    message,
    action: {
      type: actionType,
      ...(formId ? { formId } : {}),
    },
    pendingAction: pendingAction
      ? {
          intent: pendingAction.intent || null,
          executor: pendingAction.executor || null,
          missingFields: Array.isArray(missingFields)
            ? missingFields
            : pendingAction.missingFields || [],
          collected: pendingAction.collected || {},
          formId: pendingAction.formId || null,
        }
      : null,
  };
}
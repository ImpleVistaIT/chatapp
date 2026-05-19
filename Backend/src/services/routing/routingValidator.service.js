import { normalizeRoutingResult } from "../../config/routing.schema.js";
import { getIntentDefinition, isSupportedIntent } from "../../config/routing.registry.js";

function getMissingInputs(requiredInputs = [], entities = {}) {
  return requiredInputs.filter((key) => {
    const value = entities?.[key];
    if (value == null) return true;
    if (typeof value === "string" && !value.trim()) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}

export function validateRoutingResult(routingResult) {
  const result = normalizeRoutingResult(routingResult);

  if (
    result.system === "ambiguous" ||
    result.system === "unknown" ||
    result.module === "unknown" ||
    result.intent === "unknown"
  ) {
    return normalizeRoutingResult({
      ...result,
      needsClarification: true,
      clarificationQuestion:
        result.clarificationQuestion ||
        "I’m not fully sure what you want to do. Can you clarify the target system or action?",
      action: "ask_question",
    });
  }

  const supported = isSupportedIntent({
    system: result.system,
    module: result.module,
    intent: result.intent,
  });

  if (!supported) {
    return normalizeRoutingResult({
      ...result,
      needsClarification: true,
      clarificationQuestion:
        "This request is not currently supported. Please rephrase or choose a supported action.",
      action: "unsupported",
    });
  }

  const definition = getIntentDefinition({
    system: result.system,
    module: result.module,
    intent: result.intent,
  });

  const requiredInputs = Array.isArray(definition?.requiredInputs)
    ? definition.requiredInputs
    : [];

  const missingInputs = getMissingInputs(requiredInputs, result.entities);

  let action = definition?.action || "none";
  let needsClarification = false;
  let clarificationQuestion = result.clarificationQuestion || "";

  if (result.confidence < 0.6) {
    needsClarification = true;
    action = "ask_question";
    clarificationQuestion =
      clarificationQuestion ||
      "I found multiple possible actions. Can you confirm what you want to do?";
  } else if (missingInputs.length > 0) {
    if (action === "execute_api") {
      action = "ask_question";
      needsClarification = true;
      clarificationQuestion =
        clarificationQuestion ||
        `I need a few more details to continue: ${missingInputs.join(", ")}.`;
    }

    if (action === "open_form") {
      needsClarification = false;
    }
  }

  return normalizeRoutingResult({
    ...result,
    requiredInputs,
    missingInputs,
    needsClarification,
    clarificationQuestion,
    action,
    actionPayload:
      action === "open_form"
        ? {
            formId: definition?.formId || null,
            requiredInputs,
          }
        : result.actionPayload,
  });
}
import { normalizeRoutingResult } from "../../config/routing.schema.js";
import { getIntentDefinition, isSupportedIntent } from "../../config/routing.registry.js";

function getMissingFields(requiredFields = [], entities = {}) {
  return requiredFields.filter((key) => {
    const value = entities?.[key];
    if (value == null) return true;
    if (typeof value === "string" && !value.trim()) return true;
    if (Array.isArray(value) && value.length === 0) return true;
    return false;
  });
}

function looksLikePoQuery(result) {
  const query = String(
    result?.originalQuery ||
    result?.query ||
    result?.message ||
    ""
  ).toLowerCase();
  return /\b(po|purchase\s*order|purchase\s*orders)\b/.test(query);
}

export function validateRoutingResult(routingResult) {
  const result = normalizeRoutingResult(routingResult);
  const poLike = looksLikePoQuery(result);

  const unknownish =
    result.system === "ambiguous" ||
    result.system === "unknown" ||
    result.module === "unknown" ||
    result.intent === "unknown";

  if (unknownish) {
    if (poLike) {
      return normalizeRoutingResult({
        ...result,
        system: "s4hana",
        module: "mm",
        intent: "list_purchase_orders",
        needsClarification: false,
        clarificationQuestion: "",
        action: "execute_api",
        collected: result.entities || {},
        requiredFields: [],
        missingFields: [],
      });
    }

    return normalizeRoutingResult({
      ...result,
      needsClarification: true,
      clarificationQuestion:
        result.clarificationQuestion ||
        "I’m not fully sure what you want to do. Can you clarify the target system or action?",
      action: "ask_question",
      collected: result.entities || {},
      requiredFields: [],
      missingFields: [],
    });
  }

  const supported = isSupportedIntent({
    system: result.system,
    module: result.module,
    intent: result.intent,
  });

  if (!supported) {
    if (poLike) {
      return normalizeRoutingResult({
        ...result,
        system: "s4hana",
        module: "mm",
        intent: "list_purchase_orders",
        needsClarification: false,
        clarificationQuestion: "",
        action: "execute_api",
        collected: result.entities || {},
        requiredFields: [],
        missingFields: [],
      });
    }

    return normalizeRoutingResult({
      ...result,
      needsClarification: true,
      clarificationQuestion:
        "This request is not currently supported. Please rephrase or choose a supported action.",
      action: "unsupported",
      collected: result.entities || {},
      requiredFields: [],
      missingFields: [],
    });
  }

  const definition = getIntentDefinition({
    system: result.system,
    module: result.module,
    intent: result.intent,
  });

  const requiredFields = Array.isArray(definition?.requiredInputs)
    ? definition.requiredInputs
    : [];

  const missingFields = getMissingFields(requiredFields, result.entities);

  let action = definition?.action || "none";
  let needsClarification = false;
  let clarificationQuestion = result.clarificationQuestion || "";

  if (result.confidence < 0.6) {
    if (poLike) {
      action = "execute_api";
      needsClarification = false;
      clarificationQuestion = "";
    } else {
      needsClarification = true;
      action = "ask_question";
      clarificationQuestion =
        clarificationQuestion ||
        "I found multiple possible actions. Can you confirm what you want to do?";
    }
  } else if (missingFields.length > 0) {
    if (action === "execute_api") {
      action = "ask_question";
      needsClarification = true;
      clarificationQuestion =
        clarificationQuestion ||
        `I need a few more details to continue: ${missingFields.join(", ")}.`;
    }

    if (action === "open_form") {
      needsClarification = false;
    }
  }

  return normalizeRoutingResult({
    ...result,
    requiredInputs: requiredFields,
    missingInputs: missingFields,
    requiredFields,
    missingFields,
    collected: result.entities || {},
    needsClarification,
    clarificationQuestion,
    action,
    actionPayload:
      action === "open_form"
        ? {
            formId: definition?.formId || null,
            requiredFields,
            missingFields,
          }
        : result.actionPayload,
  });
}
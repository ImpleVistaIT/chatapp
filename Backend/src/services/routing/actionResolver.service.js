import { normalizeRoutingResult } from "../../config/routing.schema.js";
import { getIntentDefinition } from "../../config/routing.registry.js";
import { buildClarificationResponse } from "./clarificationBuilder.service.js";

export function resolveRoutingAction(routingResult) {
  const result = normalizeRoutingResult(routingResult);

  if (result.needsClarification || result.action === "ask_question" || result.action === "unsupported") {
    return buildClarificationResponse(result);
  }

  const definition = getIntentDefinition({
    system: result.system,
    module: result.module,
    intent: result.intent,
  });

  if (!definition) {
    return {
      ok: true,
      status: "unsupported",
      message: "This request is not supported yet.",
      routing: result,
      action: {
        type: "unsupported",
      },
    };
  }

  if (result.action === "open_form") {
    return {
      ok: true,
      status: "input_required",
      message: `Please provide the details for ${definition.label}.`,
      routing: result,
      action: {
        type: "open_form",
        formId: definition.formId || null,
        title: definition.label,
        requiredInputs: result.requiredInputs || [],
        missingInputs: result.missingInputs || [],
      },
    };
  }

  if (result.action === "execute_api") {
    return {
      ok: true,
      status: "ready_to_execute",
      message: `Executing ${definition.label}.`,
      routing: result,
      action: {
        type: "execute_api",
        executor: definition.executor,
        requiredInputs: result.requiredInputs || [],
        payload: result.entities || {},
      },
    };
  }

  return {
    ok: true,
    status: "noop",
    message: "No action resolved.",
    routing: result,
    action: {
      type: "none",
    },
  };
}
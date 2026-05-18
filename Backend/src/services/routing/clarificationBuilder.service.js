import { normalizeRoutingResult } from "../../config/routing.schema.js";

function buildMissingInputMessage(missingInputs = []) {
  if (!missingInputs.length) {
    return "I need a bit more information to continue.";
  }

  if (missingInputs.length === 1) {
    return `I need ${missingInputs[0]} to continue.`;
  }

  return `I need a few more details to continue: ${missingInputs.join(", ")}.`;
}

function buildSystemOptions() {
  return [
    { label: "S/4HANA", value: "s4hana" },
    { label: "Solution Manager", value: "solman" },
  ];
}

export function buildClarificationResponse(routingResult) {
  const result = normalizeRoutingResult(routingResult);

  if (!result.needsClarification && result.action !== "ask_question" && result.action !== "unsupported") {
    return null;
  }

  let question =
    result.clarificationQuestion || "Can you clarify what you want to do?";
  let options = [];

  if (
    result.system === "ambiguous" ||
    result.system === "unknown" ||
    result.module === "unknown" ||
    result.intent === "unknown"
  ) {
    question =
      result.clarificationQuestion ||
      "Do you want to continue in S/4HANA or Solution Manager?";
    options = buildSystemOptions();
  } else if (Array.isArray(result.missingInputs) && result.missingInputs.length > 0) {
    question =
      result.clarificationQuestion ||
      buildMissingInputMessage(result.missingInputs);
  } else if (result.action === "unsupported") {
    question =
      result.clarificationQuestion ||
      "This action is not supported yet. Please try a supported request.";
  }

  return {
    ok: true,
    status: "needs_clarification",
    message: question,
    routing: result,
    action: {
      type: result.action === "unsupported" ? "unsupported" : "ask_question",
      question,
      options,
      expectedInputs: Array.isArray(result.missingInputs) ? result.missingInputs : [],
    },
  };
}
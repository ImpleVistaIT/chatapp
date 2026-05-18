export const ROUTING_SYSTEMS = ["s4hana", "solman", "ambiguous", "unknown"];

export const ROUTING_MODULES = [
  "mm",
  "sd",
  "finance",
  "approval",
  "charm",
  "incident",
  "transport",
  "unknown",
];

export const ROUTING_INTENTS = [
  "list_purchase_orders",
  "get_purchase_order_details",
  "check_approvals",
  "create_change_request",
  "get_change_request_details",
  "create_transport",
  "unknown",
];

export const ROUTING_ACTIONS = [
  "execute_api",
  "open_form",
  "ask_question",
  "confirm",
  "unsupported",
  "none",
];

export function createRoutingResult(overrides = {}) {
  return {
    system: "unknown",
    module: "unknown",
    intent: "unknown",
    confidence: 0,
    reason: "",
    source: "unknown", // llm | keyword | rule | validator | memory | unknown
    entities: {},
    needsClarification: false,
    clarificationQuestion: "",
    clarificationOptions: [],
    requiredInputs: [],
    missingInputs: [],
    action: "none",
    actionPayload: null,
    ...overrides,
  };
}

export function normalizeEnum(value, allowed, fallback) {
  const v = String(value || "").trim().toLowerCase();
  return allowed.includes(v) ? v : fallback;
}

export function clampConfidence(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

export function normalizeRoutingResult(input = {}) {
  return createRoutingResult({
    system: normalizeEnum(input.system, ROUTING_SYSTEMS, "unknown"),
    module: normalizeEnum(input.module, ROUTING_MODULES, "unknown"),
    intent: normalizeEnum(input.intent, ROUTING_INTENTS, "unknown"),
    confidence: clampConfidence(input.confidence),
    reason: String(input.reason || "").trim(),
    source: String(input.source || "unknown").trim().toLowerCase(),
    entities: input.entities && typeof input.entities === "object" ? input.entities : {},
    needsClarification: Boolean(input.needsClarification),
    clarificationQuestion: String(input.clarificationQuestion || "").trim(),
    clarificationOptions: Array.isArray(input.clarificationOptions) ? input.clarificationOptions : [],
    requiredInputs: Array.isArray(input.requiredInputs) ? input.requiredInputs : [],
    missingInputs: Array.isArray(input.missingInputs) ? input.missingInputs : [],
    action: normalizeEnum(input.action, ROUTING_ACTIONS, "none"),
    actionPayload: input.actionPayload ?? null,
  });
}
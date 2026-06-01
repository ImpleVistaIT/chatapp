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
    collected: {},
    needsClarification: false,
    clarificationQuestion: "",
    clarificationOptions: [],
    requiredInputs: [],
    missingInputs: [],
    requiredFields: [],
    missingFields: [],
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

function normalizeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function normalizeStringArray(value) {
  return Array.isArray(value)
    ? value.map((x) => String(x || "").trim()).filter(Boolean)
    : [];
}

export function normalizeRoutingResult(input = {}) {
  const entities = normalizeObject(input.entities);
  const collected = normalizeObject(input.collected);

  const requiredInputs = normalizeStringArray(input.requiredInputs);
  const missingInputs = normalizeStringArray(input.missingInputs);

  const requiredFields = normalizeStringArray(
    input.requiredFields?.length ? input.requiredFields : requiredInputs
  );

  const missingFields = normalizeStringArray(
    input.missingFields?.length ? input.missingFields : missingInputs
  );

  return createRoutingResult({
    system: normalizeEnum(input.system, ROUTING_SYSTEMS, "unknown"),
    module: normalizeEnum(input.module, ROUTING_MODULES, "unknown"),
    intent: normalizeEnum(input.intent, ROUTING_INTENTS, "unknown"),
    confidence: clampConfidence(input.confidence),
    reason: String(input.reason || "").trim(),
    source: String(input.source || "unknown").trim().toLowerCase(),
    entities,
    collected: Object.keys(collected).length > 0 ? collected : entities,
    needsClarification: Boolean(input.needsClarification),
    clarificationQuestion: String(input.clarificationQuestion || "").trim(),
    clarificationOptions: Array.isArray(input.clarificationOptions)
      ? input.clarificationOptions
      : [],
    requiredInputs,
    missingInputs,
    requiredFields,
    missingFields,
    action: normalizeEnum(input.action, ROUTING_ACTIONS, "none"),
    actionPayload: input.actionPayload ?? null,
  });
}
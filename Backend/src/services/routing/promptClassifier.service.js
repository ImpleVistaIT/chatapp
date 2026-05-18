import { buildClassifierPrompt } from "../../prompts/router/classifier.prompt.js";
import { generateJson } from "../llm/ollama.client.js";
import { ROUTING_CONFIG } from "../../config/routing.config.js";
import { normalizeRoutingResult } from "../../config/routing.schema.js";
import { isSupportedIntent } from "../../config/routing.registry.js";

function normalizeSystem(value) {
  const v = String(value || "").trim().toLowerCase();
  if (v === "s4" || v === "s4hana") return "s4hana";
  if (v === "solman" || v === "solutionmanager" || v === "solution_manager") return "solman";
  if (v === "ambiguous") return "ambiguous";
  return "unknown";
}

function normalizeModule(value) {
  const v = String(value || "").trim().toLowerCase();
  if (["mm", "materials", "material_management"].includes(v)) return "mm";
  if (["sd", "sales"].includes(v)) return "sd";
  if (["finance", "fi"].includes(v)) return "finance";
  if (["approval", "approvals"].includes(v)) return "approval";
  if (["charm", "cha_rm", "change_request"].includes(v)) return "charm";
  if (["incident", "incidents"].includes(v)) return "incident";
  if (["transport", "transports"].includes(v)) return "transport";
  if (["unknown", "ambiguous"].includes(v)) return "unknown";
  return "unknown";
}

function normalizeIntent(value) {
  const v = String(value || "").trim().toLowerCase();
  const map = {
    list_purchase_orders: "list_purchase_orders",
    get_purchase_order_details: "get_purchase_order_details",
    check_approvals: "check_approvals",
    create_change_request: "create_change_request",
    get_change_request_details: "get_change_request_details",
    create_transport: "create_transport",
    unknown: "unknown",
  };
  return map[v] || "unknown";
}

function clampConfidence(n) {
  const x = Number(n);
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function cleanString(value) {
  const v = String(value ?? "").trim();
  return v || null;
}

function normalizeCreateChangeRequestEntities(raw = {}) {
  return {
    ShortDesc: cleanString(raw.ShortDesc || raw.shortDesc || raw.short_description || raw.description),
    DeliveryResponsible: cleanString(
      raw.DeliveryResponsible || raw.deliveryResponsible || raw.delivery_responsible
    ),
    Developer: cleanString(raw.Developer || raw.developer),
    Tester: cleanString(raw.Tester || raw.tester),
    WorkItemReference: cleanString(
      raw.WorkItemReference || raw.workItemReference || raw.work_item_reference || raw.ticket || raw.incident
    ),
    Landscape: cleanString(raw.Landscape || raw.landscape),
  };
}

function normalizePurchaseOrderDetailEntities(raw = {}) {
  return {
    PurchaseOrder: cleanString(
      raw.PurchaseOrder || raw.purchaseOrder || raw.purchase_order || raw.poNumber || raw.po
    ),
  };
}

function normalizeApprovalEntities(raw = {}) {
  return {
    Approver: cleanString(raw.Approver || raw.approver || raw.user || raw.userId),
    Status: cleanString(raw.Status || raw.status),
  };
}

function normalizeEntitiesByIntent(intent, rawEntities = {}) {
  const raw = rawEntities && typeof rawEntities === "object" ? rawEntities : {};

  switch (intent) {
    case "create_change_request":
      return normalizeCreateChangeRequestEntities(raw);

    case "get_purchase_order_details":
      return normalizePurchaseOrderDetailEntities(raw);

    case "check_approvals":
      return normalizeApprovalEntities(raw);

    default:
      return raw;
  }
}

function keywordFallback(query) {
  const q = String(query || "").toLowerCase();

  if (q.includes("create change request") || q.includes("raise change request") || q.includes("create solman cr")) {
    return normalizeRoutingResult({
      system: "solman",
      module: "charm",
      intent: "create_change_request",
      confidence: 0.9,
      reason: "Matched explicit SolMan change request keywords",
      source: "keyword",
      entities: normalizeEntitiesByIntent("create_change_request", {}),
    });
  }

  if (q.includes("purchase order") && q.includes("details")) {
    return normalizeRoutingResult({
      system: "s4hana",
      module: "mm",
      intent: "get_purchase_order_details",
      confidence: 0.86,
      reason: "Matched purchase order details keywords",
      source: "keyword",
      entities: normalizeEntitiesByIntent("get_purchase_order_details", {}),
    });
  }

  if (q.includes("purchase order") || q.includes("latest po") || q.includes("latest purchase orders")) {
    return normalizeRoutingResult({
      system: "s4hana",
      module: "mm",
      intent: "list_purchase_orders",
      confidence: 0.84,
      reason: "Matched purchase order listing keywords",
      source: "keyword",
      entities: {},
    });
  }

  if (q.includes("approval") || q.includes("approvals")) {
    return normalizeRoutingResult({
      system: "s4hana",
      module: "approval",
      intent: "check_approvals",
      confidence: 0.8,
      reason: "Matched approval-related keywords",
      source: "keyword",
      entities: normalizeEntitiesByIntent("check_approvals", {}),
    });
  }

  return normalizeRoutingResult({
    system: "ambiguous",
    module: "unknown",
    intent: "unknown",
    confidence: 0.4,
    reason: "No strong routing signal found",
    source: "keyword",
    entities: {},
  });
}

export async function classifyPrompt({ query, sessionContext = null }) {
  const prompt = buildClassifierPrompt({ query, sessionContext });

  const llm = await generateJson({
    prompt,
    schemaHint: "routing-classifier",
  });

  if (llm.ok && llm.data) {
    const normalizedIntent = normalizeIntent(llm.data.intent);

    const candidate = normalizeRoutingResult({
      system: normalizeSystem(llm.data.system),
      module: normalizeModule(llm.data.module),
      intent: normalizedIntent,
      confidence: clampConfidence(llm.data.confidence),
      reason: String(llm.data.reason || "").trim() || "LLM classification",
      source: "llm",
      entities: normalizeEntitiesByIntent(normalizedIntent, llm.data.entities),
    });

    if (candidate.system === "ambiguous") {
      return candidate;
    }

    if (
      candidate.system === "s4hana" &&
      !ROUTING_CONFIG.systems.s4hana.enabled
    ) {
      return normalizeRoutingResult({
        ...candidate,
        system: "unknown",
        module: "unknown",
        intent: "unknown",
        confidence: 0.2,
        reason: "S/4HANA routing is disabled",
        source: "validator",
      });
    }

    if (
      candidate.system === "solman" &&
      !ROUTING_CONFIG.systems.solman.enabled
    ) {
      return normalizeRoutingResult({
        ...candidate,
        system: "unknown",
        module: "unknown",
        intent: "unknown",
        confidence: 0.2,
        reason: "SolMan routing is disabled",
        source: "validator",
      });
    }

    if (
      candidate.system !== "unknown" &&
      candidate.module !== "unknown" &&
      candidate.intent !== "unknown" &&
      isSupportedIntent({
        system: candidate.system,
        module: candidate.module,
        intent: candidate.intent,
      })
    ) {
      return candidate;
    }
  }

  return keywordFallback(query);
}
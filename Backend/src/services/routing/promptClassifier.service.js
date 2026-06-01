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
    list_change_requests: "list_change_requests",
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

function normalizeDateYYYYMMDD(value) {
  const v = cleanString(value);
  if (!v) return null;

  if (/^\d{8}$/.test(v)) {
    return v;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return v.replaceAll("-", "");
  }

  return null;
}

function extractCrNumber(query) {
  const q = String(query || "");
  const match = q.match(/\b(?:cr|change request)\s*(?:number\s*)?(\d{6,20})\b/i);
  if (match) return match[1];

  const fallback = q.match(/\b(8\d{9,})\b/);
  return fallback ? fallback[1] : null;
}

function extractDateRange(query) {
  const q = String(query || "");

  const dates = [...q.matchAll(/\b(\d{4}-\d{2}-\d{2}|\d{8})\b/g)]
    .map((m) => normalizeDateYYYYMMDD(m[1]))
    .filter(Boolean);

  if (dates.length >= 2) {
    return {
      fromDate: dates[0],
      toDate: dates[1],
    };
  }

  if (dates.length === 1) {
    return {
      fromDate: dates[0],
      toDate: dates[0],
    };
  }

  return {
    fromDate: null,
    toDate: null,
  };
}

function inferProcessType(query) {
  const q = String(query || "").toLowerCase();

  if (q.includes("india")) return "YMH1";
  return "YMHF";
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

function normalizeGetChangeRequestEntities(raw = {}) {
  return {
    objectId: cleanString(
      raw.objectId ||
        raw.OBJECT_ID ||
        raw.changeRequestId ||
        raw.crId ||
        raw.crNumber ||
        raw.ChangeRequest ||
        raw.CR
    ),
    processType: cleanString(raw.processType || raw.PROCESS_TYPE) || "YMHF",
  };
}

function normalizeListChangeRequestEntities(raw = {}) {
  return {
    fromDate: normalizeDateYYYYMMDD(raw.fromDate || raw.FROM_DATE),
    toDate: normalizeDateYYYYMMDD(raw.toDate || raw.TO_DATE),
    processType: cleanString(raw.processType || raw.PROCESS_TYPE) || "YMHF",
    triggerAll: cleanString(raw.triggerAll || raw.TRIGGER_ALL) || "X",
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

    case "get_change_request_details":
      return normalizeGetChangeRequestEntities(raw);

    case "list_change_requests":
      return normalizeListChangeRequestEntities(raw);

    default:
      return raw;
  }
}

function keywordFallback(query) {
  const q = String(query || "").toLowerCase();
  const objectId = extractCrNumber(query);
  const { fromDate, toDate } = extractDateRange(query);
  const processType = inferProcessType(query);

  const mentionsPo = /\bpo\b/.test(q) || q.includes("purchase order") || q.includes("purchase orders");
  const wantsDetails = /\b(details?|info|information|show details|full details|complete details)\b/.test(q);

  const mentionsCr =
    q.includes("change request") ||
    /\bcr\b/.test(q);

  const wantsCrDetails =
    q.includes("details") ||
    q.includes("detail") ||
    q.includes("status") ||
    q.includes("show") ||
    q.includes("get") ||
    q.includes("fetch") ||
    q.includes("view");

  if (objectId && mentionsCr && wantsCrDetails) {
    return normalizeRoutingResult({
      system: "solman",
      module: "charm",
      intent: "get_change_request_details",
      confidence: 0.94,
      reason: "Matched SolMan CR detail/status keywords",
      source: "keyword",
      entities: {
        objectId,
        processType,
      },
    });
  }

  if (
    (q.includes("change requests") || q.includes("change request") || q.includes("solman change requests")) &&
    (fromDate || toDate)
  ) {
    return normalizeRoutingResult({
      system: "solman",
      module: "charm",
      intent: "list_change_requests",
      confidence: 0.92,
      reason: "Matched SolMan change request list/date keywords",
      source: "keyword",
      entities: {
        fromDate,
        toDate,
        processType,
        triggerAll: "X",
      },
    });
  }

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

  if (mentionsPo && wantsDetails) {
    return normalizeRoutingResult({
      system: "s4hana",
      module: "mm",
      intent: "get_purchase_order_details",
      confidence: 0.88,
      reason: "Matched purchase order details keywords",
      source: "keyword",
      entities: normalizeEntitiesByIntent("get_purchase_order_details", {}),
    });
  }

  if (mentionsPo) {
    return normalizeRoutingResult({
      system: "s4hana",
      module: "mm",
      intent: "list_purchase_orders",
      confidence: 0.86,
      reason: "Matched purchase order keywords",
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
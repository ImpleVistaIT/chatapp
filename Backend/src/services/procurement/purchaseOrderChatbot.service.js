import { generateJson } from "../llm/ollama.client.js";

const CDS_REGISTRY = [
  {
    key: "PO",
    label: "Purchase Order",
    serviceType: "PO",
    entityHints: ["po", "purchase order", "purchase orders"],
    idFieldHints: ["PoNo", "EBELN"],
    itemFieldHints: ["PoItem", "EBELP"],
    joinKeys: [],
  },
  {
    key: "MAT",
    label: "Material Ledger",
    serviceType: "MAT",
    entityHints: ["material movement", "material ledger", "goods receipt", "gr", "migo"],
    idFieldHints: ["PoNo", "EBELN", "MaterialDocument", "MBLNR"],
    itemFieldHints: ["PoItem", "EBELP", "MaterialDocumentItem", "ZEILE"],
    joinKeys: ["PoNo", "PoItem"],
  },
  {
    key: "RSEG",
    label: "Invoice Item",
    serviceType: "RSEG",
    entityHints: ["invoice", "invoice item", "ir", "miro"],
    idFieldHints: ["InvoiceNumber", "BELNR", "RBKPInvoice"],
    itemFieldHints: ["FiscalYear", "GJAHR"],
    joinKeys: ["InvoiceNumber", "FiscalYear", "MaterialDocument", "PoNo", "PoItem"],
  },
  {
    key: "RBKP",
    label: "Invoice Header",
    serviceType: "RBKP",
    entityHints: ["invoice header", "invoice summary", "invoice status"],
    idFieldHints: ["InvoiceNumber", "BELNR"],
    itemFieldHints: ["FiscalYear", "GJAHR"],
    joinKeys: ["InvoiceNumber", "FiscalYear"],
  },
  {
    key: "ACDOCA",
    label: "Accounting Document",
    serviceType: "ACDOCA",
    entityHints: ["accounting", "gl posting", "cost center", "profit center", "debit", "credit"],
    idFieldHints: ["AccountingDocument", "BELNR"],
    itemFieldHints: ["FiscalYear", "GJAHR"],
    joinKeys: ["AccountingDocument", "FiscalYear", "InvoiceNumber"],
  },
];

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map(cleanString).filter(Boolean))];
}

function scoreSource(query, source) {
  const q = normalizeText(query);
  let score = 0;
  for (const hint of source.entityHints) {
    if (q.includes(normalizeText(hint))) score += 20;
  }
  if (source.key === "PO" && /\bpo\b|purchase order/i.test(q)) score += 20;
  if (source.key === "RSEG" && /\binvoice\b|miro|\bir\b/i.test(q)) score += 25;
  if (source.key === "RBKP" && /header|summary|status/i.test(q)) score += 10;
  if (source.key === "ACDOCA" && /account|gl|cost center|profit center|debit|credit/i.test(q)) score += 25;
  if (source.key === "MAT" && /gr|goods receipt|material movement|migo/i.test(q)) score += 25;
  if (/\b(last|this|today|yesterday|between|before|after|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec|q1|q2|q3|q4)\b/i.test(q)) score += 5;
  if (/\b(top|highest|lowest|average|sum|total|monthly|yearly|quarterly)\b/i.test(q)) score += 8;
  return score;
}

export function buildProcurementMetadataPrompt({ query, services }) {
  return `You are a SAP procurement OData planner. Return JSON only.\n\nUser query: ${JSON.stringify(String(query || ""))}\n\nAvailable CDS services: ${JSON.stringify(services, null, 2)}\n\nReturn JSON with this shape:\n{\n  "primary": {"serviceType": "", "reason": ""},\n  "chain": [{"serviceType": "", "joinKeys": []}],\n  "filters": [],\n  "select": [],\n  "orderBy": [],\n  "calculations": [],\n  "groupBy": [],\n  "status": "list|summary|detail|lifecycle",\n  "top": 100,\n  "skip": 0,\n  "dateHints": [],\n  "notes": []\n}`;
}

function pickSources(query) {
  return [...CDS_REGISTRY]
    .map((source) => ({ source, score: scoreSource(query, source) }))
    .sort((left, right) => right.score - left.score)
    .filter((item, index, array) => item.score > 0 || index === 0 || item.source.key === array[0].source.key)
    .slice(0, 3)
    .map((item) => item.source);
}

function buildFallbackPlan(query) {
  const sources = pickSources(query);
  const primary = sources[0] || CDS_REGISTRY[0];
  const chain = sources.slice(1).map((source) => ({ serviceType: source.serviceType, joinKeys: source.joinKeys }));
  const status = /lifecycle|complete lifecycle|history/i.test(query) ? "lifecycle" : /summary|count|total|top|highest|lowest|average/i.test(query) ? "summary" : /detail/i.test(query) ? "detail" : "list";
  return { primary: { serviceType: primary.serviceType, reason: "heuristic match" }, chain, filters: [], select: [], orderBy: [], calculations: [], groupBy: [], status, top: 100, skip: 0, dateHints: [], notes: [] };
}

export async function planProcurementChatQuery({ query, serviceCatalog = [] }) {
  const services = Array.isArray(serviceCatalog) ? serviceCatalog : [];
  if (!services.length) return buildFallbackPlan(query);

  const candidates = pickSources(query).map((source) => ({
    ...source,
    service: services.find((service) => cleanString(service?.serviceType).toUpperCase() === source.serviceType) || null,
  })).filter((item) => item.service);

  const compactServices = candidates.map((candidate) => ({
    key: candidate.key,
    serviceType: candidate.serviceType,
    label: candidate.label,
    serviceName: candidate.service.serviceName,
    entitySet: candidate.service.entitySet,
    entityTypeName: candidate.service.entityTypeName,
    idField: candidate.service.idField,
    itemField: candidate.service.itemField,
    joinKeys: unique([...(candidate.joinKeys || []), candidate.service.idField, candidate.service.itemField]),
    fields: Array.isArray(candidate.service.fields) ? candidate.service.fields.slice(0, 25) : [],
  }));

  try {
    const llm = await generateJson({
      prompt: buildProcurementMetadataPrompt({ query, services: compactServices }),
      schemaHint: "sap-procurement-chat-plan",
      timeoutMs: Number(process.env.PROCUREMENT_QUERY_TIMEOUT_MS || 20000),
    });

    if (llm?.ok && llm?.data) {
      return llm.data;
    }
  } catch {
    // fall through to deterministic fallback
  }

  const fallback = candidates[0] || pickSources(query)[0] || CDS_REGISTRY[0];
  return {
    primary: { serviceType: fallback.serviceType, reason: "fallback" },
    chain: candidates.slice(1).map((candidate) => ({ serviceType: candidate.serviceType, joinKeys: candidate.joinKeys })),
    filters: [],
    select: [],
    orderBy: [],
    calculations: [],
    groupBy: [],
    status: /lifecycle|history/i.test(query) ? "lifecycle" : "list",
    top: 100,
    skip: 0,
    dateHints: [],
    notes: [],
  };
}

export function getProcurementCdsRegistry() {
  return CDS_REGISTRY.map((source) => ({ ...source }));
}
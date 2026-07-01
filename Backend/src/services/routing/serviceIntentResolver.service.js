import { SapServiceCatalog } from "../../models/SapServiceCatalog.model.js";
import { generateJson } from "../llm/ollama.client.js";

function compactField(field) {
  return {
    name: String(field?.name || "").trim(),
    label: String(field?.label || "").trim(),
    type: String(field?.type || "").trim(),
  };
}

function compactService(service) {
  return {
    systemId: String(service?.systemId || "").trim(),
    serviceName: String(service?.serviceName || "").trim(),
    entitySet: String(service?.entitySet || "").trim(),
    entityTypeName: String(service?.entityTypeName || "").trim(),
    keys: Array.isArray(service?.keys) ? service.keys : [],
    labelsText: String(service?.labelsText || "").slice(0, 1500),
    domainHints: Array.isArray(service?.domainHints) ? service.domainHints.slice(0, 40) : [],
    fields: Array.isArray(service?.fields) ? service.fields.slice(0, 20).map(compactField) : [],
  };
}

function getServiceSearchText(service) {
  const fieldText = Array.isArray(service?.fields)
    ? service.fields
        .map((field) => `${String(field?.name || "")} ${String(field?.label || "")}`.trim())
        .join(" ")
    : "";

  return [
    service?.serviceName,
    service?.entitySet,
    service?.entityTypeName,
    service?.labelsText,
    Array.isArray(service?.domainHints) ? service.domainHints.join(" ") : "",
    Array.isArray(service?.keys) ? service.keys.join(" ") : "",
    fieldText,
  ]
    .map((value) => String(value || "").toLowerCase())
    .join(" ");
}

function scoreCatalogService(service, query) {
  const q = String(query || "").toLowerCase();
  const text = getServiceSearchText(service);
  let score = 0;

  if (/\b(po|purchase\s*order|purchase\s*orders)\b/i.test(q)) {
    score += 25;
  }

  if (/\b(detail|details|specific|single)\b/i.test(q)) {
    score += 20;
  }

  if (/\b(show|get|view|display|fetch|open)\b/i.test(q)) {
    score += 5;
  }

  if (quickExtractDocNumber(q)) {
    score += 30;
  }

  if (text.includes("purchase order")) {
    score += 30;
  }

  if (text.includes("detail")) {
    score += 40;
  }

  if (/\bpo\b/i.test(text)) {
    score += 10;
  }

  if (/\b(po|purchase\s*order)\b/i.test(text) && quickExtractDocNumber(q)) {
    score += 15;
  }

  if (Array.isArray(service?.keys) && service.keys.some((key) => /po|purchase/i.test(String(key || "")))) {
    score += 12;
  }

  if (
    Array.isArray(service?.fields) &&
    service.fields.some((field) => /po|purchase/i.test(String(field?.name || field?.label || "")))
  ) {
    score += 12;
  }

  if (/\blist\b/i.test(text) && /\bdetail|details\b/i.test(q)) {
    score -= 5;
  }

  return score;
}

export function pickBestCatalogService(catalog, query) {
  const services = Array.isArray(catalog) ? catalog.filter(Boolean) : [];
  if (!services.length) {
    return null;
  }

  let bestService = services[0];
  let bestScore = scoreCatalogService(bestService, query);

  for (let i = 1; i < services.length; i += 1) {
    const candidate = services[i];
    const candidateScore = scoreCatalogService(candidate, query);
    if (candidateScore > bestScore) {
      bestService = candidate;
      bestScore = candidateScore;
    }
  }

  return {
    service: bestService,
    score: bestScore,
  };
}

function buildHeuristicFallback(catalog, query) {
  const docNumber = quickExtractDocNumber(query);
  if (!docNumber) {
    return null;
  }

  const best = pickBestCatalogService(catalog, query);
  if (!best?.service) {
    return null;
  }

  return {
    matchFound: true,
    confidence: 0.9,
    systemId: String(best.service?.systemId || "").trim().toUpperCase(),
    serviceName: String(best.service?.serviceName || "").trim(),
    entitySet: String(best.service?.entitySet || "").trim(),
    entityTypeName: String(best.service?.entityTypeName || "").trim(),
    operation: inferOperation(query),
    docNumber,
    docItem: null,
    fields: [],
    filters: [],
    orderBy: [],
    limit: 10,
    reason: "Heuristic fallback matched numbered purchase order query",
    candidatesConsidered: Array.isArray(catalog) ? catalog.length : 0,
  };
}

function buildRoutingPrompt({ query, services }) {
  return `
You are an SAP OData routing engine.

Task:
Given a user query and a catalog of SAP OData services, select the single best matching service and extract a query plan.

You must normalize different phrasings into the same structured plan.
Do not depend on exact keyword matching. Focus on intent, entity meaning, field labels, filters, and sort preferences.
Treat quoted and unquoted values the same.
Preserve IDs, usernames, and document numbers exactly as typed.

Rules:
- Return JSON only.
- Choose exactly one best service if possible.
- Use field labels and field names to infer meaning.
- Prefer services whose fields clearly match the user request.
- If the query asks for a list, choose a service that supports list-style retrieval.
- If the query contains a document number, include it in docNumber.
- Do not invent fields not present in the chosen service.
- If unsure, still return the best candidate with a lower confidence.

Common meaning groups:
- "show", "list", "fetch", "display", "give me" -> list-style request when no specific document number is present
- "details of PO 4500...", "show purchase order 4500...", "purchase order number 4500..." -> detail request with docNumber
- "created by", "creator", "user", "posted by" -> filter on the corresponding field if present in the catalog
- "this month", "last 30 days", "from X to Y", quoted dates, and unquoted dates -> date filters

Examples:

Example 1
User query: "show PO details for 4500012345"
Return:
{
  "matchFound": true,
  "confidence": 0.98,
  "systemId": "",
  "serviceName": "",
  "entitySet": "",
  "entityTypeName": "",
  "operation": "detail",
  "docNumber": "4500012345",
  "docItem": null,
  "fields": [],
  "filters": [],
  "orderBy": [],
  "limit": 10,
  "reason": "Detail request with a document number"
}

Example 2
User query: "show purchase orders created by S4H_MM this month"
Return:
{
  "matchFound": true,
  "confidence": 0.96,
  "systemId": "",
  "serviceName": "",
  "entitySet": "",
  "entityTypeName": "",
  "operation": "list",
  "docNumber": null,
  "docItem": null,
  "fields": [],
  "filters": [],
  "orderBy": [],
  "limit": 10,
  "reason": "List request with creator and date filters"
}

Example 3
User query: "list crs for row"
Return:
{
  "matchFound": true,
  "confidence": 0.95,
  "systemId": "",
  "serviceName": "",
  "entitySet": "",
  "entityTypeName": "",
  "operation": "list",
  "docNumber": null,
  "docItem": null,
  "fields": [],
  "filters": [],
  "orderBy": [],
  "limit": 10,
  "reason": "Normalized list request from natural language variation"
}

Required JSON shape:
{
  "matchFound": true,
  "confidence": 0.0,
  "systemId": "",
  "serviceName": "",
  "entitySet": "",
  "entityTypeName": "",
  "operation": "list" | "detail" | "search",
  "docNumber": null,
  "docItem": null,
  "fields": [],
  "filters": [],
  "orderBy": [],
  "limit": 10,
  "reason": ""
}

User query:
${JSON.stringify(String(query || ""))}

Service catalog:
${JSON.stringify(services, null, 2)}
`.trim();
}

function quickExtractDocNumber(query) {
  const q = String(query || "");
  const match = q.match(/\b(\d{6,20})\b/);
  return match ? match[1] : null;
}

function inferOperation(query) {
  const q = String(query || "").toLowerCase();

  if (quickExtractDocNumber(q)) return "detail";
  if (q.includes("latest") || q.includes("recent") || q.includes("list") || q.includes("show all")) {
    return "list";
  }
  return "search";
}

function buildSingleServiceFallback(service, query) {
  const docNumber = quickExtractDocNumber(query);

  return {
    matchFound: true,
    confidence: 0.95,
    systemId: String(service?.systemId || "").trim().toUpperCase(),
    serviceName: String(service?.serviceName || "").trim(),
    entitySet: String(service?.entitySet || "").trim(),
    entityTypeName: String(service?.entityTypeName || "").trim(),
    operation: inferOperation(query),
    docNumber,
    docItem: null,
    fields: [],
    filters: [],
    orderBy: [],
    limit: 10,
    reason: "Single active catalog service matched by fallback",
    candidatesConsidered: 1,
  };
}

export async function resolveServiceIntent({
  owner = "local",
  query,
  systemIds = [],
  limitServices = 12,
}) {
  if (!query || !String(query).trim()) {
    throw new Error("query is required");
  }

  const normalizedSystemIds = Array.isArray(systemIds)
    ? systemIds.map((x) => String(x || "").trim().toUpperCase()).filter(Boolean)
    : [];

  const cappedLimit = Math.max(1, Math.min(Number(limitServices) || 12, 50));

  const baseQuery = {
    owner,
    isActive: true,
  };

  const scopedQuery =
    normalizedSystemIds.length > 0
      ? { ...baseQuery, systemId: { $in: normalizedSystemIds } }
      : baseQuery;

  console.log("[SERVICE_INTENT] owner:", owner);
  console.log("[SERVICE_INTENT] systemIds:", systemIds);
  console.log("[SERVICE_INTENT] normalizedSystemIds:", normalizedSystemIds);
  console.log("[SERVICE_INTENT] scopedQuery:", JSON.stringify(scopedQuery));

  let catalog = await SapServiceCatalog.find(scopedQuery)
    .sort({ updatedAt: -1 })
    .limit(cappedLimit)
    .lean();

  if (!catalog.length && normalizedSystemIds.length > 0) {
    console.log("[SERVICE_INTENT] scoped query returned 0; falling back to all active catalogs for owner");
    catalog = await SapServiceCatalog.find(baseQuery)
      .sort({ updatedAt: -1 })
      .limit(cappedLimit)
      .lean();
  }

  console.log("[SERVICE_INTENT] catalogCount:", catalog.length);

  if (!catalog.length) {
    return {
      matchFound: false,
      confidence: 0,
      systemId: null,
      serviceName: null,
      entitySet: null,
      entityTypeName: null,
      operation: null,
      docNumber: null,
      docItem: null,
      fields: [],
      filters: [],
      orderBy: [],
      limit: 10,
      reason: "No active service catalog entries found",
    };
  }

  if (catalog.length === 1) {
    const fallback = buildSingleServiceFallback(catalog[0], query);
    console.log("[SERVICE_INTENT] using single-service fallback:", fallback);
    return fallback;
  }

  const services = catalog.map(compactService);
  const prompt = buildRoutingPrompt({ query, services });
  const llm = await generateJson({
    prompt,
    schemaHint: "service-intent-router",
    timeoutMs: Number(process.env.SERVICE_INTENT_TIMEOUT_MS || 30000),
  });

  const data = llm?.ok ? llm.data : null;
  const heuristicFallback = buildHeuristicFallback(catalog, query);

  if (!data?.matchFound || !data?.serviceName || !data?.entitySet) {
    if (heuristicFallback) {
      console.log("[SERVICE_INTENT] using heuristic fallback:", heuristicFallback);
      return heuristicFallback;
    }
  }

  return {
    matchFound: Boolean(data?.matchFound),
    confidence: Number(data?.confidence || 0),
    systemId: data?.systemId ? String(data.systemId).trim().toUpperCase() : null,
    serviceName: data?.serviceName ? String(data.serviceName).trim() : null,
    entitySet: data?.entitySet ? String(data.entitySet).trim() : null,
    entityTypeName: data?.entityTypeName ? String(data.entityTypeName).trim() : null,
    operation: data?.operation ? String(data.operation).trim().toLowerCase() : "list",
    docNumber: data?.docNumber ?? null,
    docItem: data?.docItem ?? null,
    fields: Array.isArray(data?.fields)
      ? data.fields.map((x) => String(x).trim()).filter(Boolean)
      : [],
    filters: Array.isArray(data?.filters) ? data.filters : [],
    orderBy: Array.isArray(data?.orderBy) ? data.orderBy : [],
    limit: Number.isFinite(Number(data?.limit))
      ? Math.max(1, Math.min(Number(data.limit), 200))
      : 10,
    reason: String(data?.reason || "").trim(),
    candidatesConsidered: services.length,
  };
}
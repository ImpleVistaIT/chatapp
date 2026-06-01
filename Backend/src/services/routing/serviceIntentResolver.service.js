import axios from "axios";
import { SapServiceCatalog } from "../../models/SapServiceCatalog.model.js";

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

function buildRoutingPrompt({ query, services }) {
  return `
You are an SAP OData routing engine.

Task:
Given a user query and a catalog of SAP OData services, select the single best matching service and extract a query plan.

Rules:
- Return JSON only.
- Choose exactly one best service if possible.
- Use field labels and field names to infer meaning.
- Prefer services whose fields clearly match the user request.
- If the query asks for a list, choose a service that supports list-style retrieval.
- If the query contains a document number, include it in docNumber.
- Do not invent fields not present in the chosen service.
- If unsure, still return the best candidate with a lower confidence.

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

function extractJson(text) {
  const s = String(text || "").trim();
  if (!s) throw new Error("Empty LLM response");

  try {
    return JSON.parse(s);
  } catch {}

  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start >= 0 && end > start) {
    const candidate = s.slice(start, end + 1);
    return JSON.parse(candidate);
  }

  throw new Error("Could not parse JSON from LLM response");
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

async function callOllama({ prompt }) {
  const baseUrl = String(process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434").replace(/\/+$/, "");
  const model = String(process.env.OLLAMA_MODEL || "llama3:latest").trim();

  const res = await axios.post(
    `${baseUrl}/api/generate`,
    {
      model,
      prompt,
      stream: false,
      format: "json",
      options: {
        temperature: 0.1,
      },
    },
    {
      timeout: 30000,
      validateStatus: () => true,
    }
  );

  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Ollama call failed (${res.status}): ${JSON.stringify(res.data).slice(0, 500)}`);
  }

  const responseText =
    typeof res.data?.response === "string"
      ? res.data.response
      : JSON.stringify(res.data);

  return extractJson(responseText);
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
  const llm = await callOllama({ prompt });

  return {
    matchFound: Boolean(llm?.matchFound),
    confidence: Number(llm?.confidence || 0),
    systemId: llm?.systemId ? String(llm.systemId).trim().toUpperCase() : null,
    serviceName: llm?.serviceName ? String(llm.serviceName).trim() : null,
    entitySet: llm?.entitySet ? String(llm.entitySet).trim() : null,
    entityTypeName: llm?.entityTypeName ? String(llm.entityTypeName).trim() : null,
    operation: llm?.operation ? String(llm.operation).trim().toLowerCase() : "list",
    docNumber: llm?.docNumber ?? null,
    docItem: llm?.docItem ?? null,
    fields: Array.isArray(llm?.fields)
      ? llm.fields.map((x) => String(x).trim()).filter(Boolean)
      : [],
    filters: Array.isArray(llm?.filters) ? llm.filters : [],
    orderBy: Array.isArray(llm?.orderBy) ? llm.orderBy : [],
    limit: Number.isFinite(Number(llm?.limit))
      ? Math.max(1, Math.min(Number(llm.limit), 200))
      : 10,
    reason: String(llm?.reason || "").trim(),
    candidatesConsidered: services.length,
  };
}
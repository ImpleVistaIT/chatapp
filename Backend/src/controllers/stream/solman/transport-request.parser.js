import { cleanString } from "./solman.shared.js";

function toUpperList(values = []) {
  const seen = new Set();
  const out = [];

  for (const value of Array.isArray(values) ? values : []) {
    const cleaned = cleanString(value).toUpperCase();
    if (!cleaned || seen.has(cleaned)) continue;
    seen.add(cleaned);
    out.push(cleaned);
  }

  return out;
  
}

function extractDeveloperTokens(text = "") {
  const q = cleanString(text);
  if (!q) return [];

  const matchers = [
    /\bdevelopers?\b[:\s-]*([\s\S]*?)(?=\b(?:owner|client|workbench|customizing|for\s+cr|for\s+change\s+request|change\s+request|transport|cr)\b|$)/i,
    /\bdeveloper\b[:\s-]*([\s\S]*?)(?=\b(?:owner|client|workbench|customizing|for\s+cr|for\s+change\s+request|change\s+request|transport|cr)\b|$)/i,
  ];

  const matches = [];

  for (const pattern of matchers) {
    const match = q.match(pattern);
    if (!match?.[1]) continue;
    matches.push(...(match[1].match(/[A-Z][A-Z0-9._-]{2,30}/gi) || []));
  }

  return matches;
}

function extractBoolean(text = "", keyword) {
  const q = cleanString(text).toLowerCase();
  if (!q) return null;

  const pattern = new RegExp(`\\b${keyword}\\b(?:\\s*(?:request)?)?[\\s:=-]*(yes|y|true|no|n|false)`, "i");
  const match = q.match(pattern);
  if (!match?.[1]) return null;

  return /^(yes|y|true)$/i.test(match[1]);
}

function extractCrNumber(text = "") {
  const q = cleanString(text);
  const match = q.match(/\b(?:cr|change request|transport request|transport)\s*(?:number\s*)?(\d{6,20})\b/i);
  return cleanString(match?.[1] || q.match(/\b(8\d{9,})\b/)?.[1] || "");
}

function extractClient(text = "") {
  const q = cleanString(text);
  const match = q.match(/\bclient\s*(?:is\s*)?(\d{3})\b/i);
  return cleanString(match?.[1] || "");
}

function extractOwner(text = "") {
  const q = cleanString(text);
  const match = q.match(/\b(?:owner|transport owner)\s*(?:is\s*)?([A-Z][A-Z0-9._-]{2,30})\b/i);
  return cleanString(match?.[1] || "").toUpperCase();
}

function normalizeRequestFlags(payload = {}) {
  return {
    workbench: Boolean(payload.WorkbenchReq),
    customizing: Boolean(payload.CustomizingReq),
  };
}

export function pickCreateTransportRequestEntities(raw = {}, query = "") {
  const q = cleanString(query);

  const developers = toUpperList([
    ...(Array.isArray(raw.DeveloperSet) ? raw.DeveloperSet.map((item) => item?.Developer) : []),
    ...(Array.isArray(raw.developerSet) ? raw.developerSet.map((item) => item?.Developer || item?.developer) : []),
    ...(Array.isArray(raw.Developers) ? raw.Developers : []),
    ...(Array.isArray(raw.developers) ? raw.developers : []),
    ...(typeof raw.developers === "string" ? raw.developers.split(/[,;\n]+/) : []),
    ...extractDeveloperTokens(q),
  ]);

  const workbench = extractBoolean(q, "workbench");
  const customizing = extractBoolean(q, "customizing");

  return {
    SolmanChangeReq: cleanString(raw.SolmanChangeReq || raw.solmanChangeReq || raw.changeRequest || raw.changeRequestId || extractCrNumber(q)),
    TrOwner: cleanString(raw.TrOwner || raw.trOwner || raw.owner || extractOwner(q)).toUpperCase(),
    Client: cleanString(raw.Client || raw.client || extractClient(q)),
    WorkbenchReq: workbench ?? Boolean(raw.WorkbenchReq),
    CustomizingReq: customizing ?? Boolean(raw.CustomizingReq),
    DeveloperSet: developers,
    DeveloperSetObjects: developers.map((Developer) => ({ Developer })),
  };
}

export function buildTransportRequestPayload(entities = {}) {
  return {
    SolmanChangeReq: cleanString(entities.SolmanChangeReq),
    TrOwner: cleanString(entities.TrOwner).toUpperCase(),
    Client: cleanString(entities.Client),
    WorkbenchReq: Boolean(entities.WorkbenchReq),
    CustomizingReq: Boolean(entities.CustomizingReq),
    DeveloperSet: Array.isArray(entities.DeveloperSetObjects)
      ? entities.DeveloperSetObjects
      : toUpperList(entities.DeveloperSet).map((Developer) => ({ Developer })),
  };
}
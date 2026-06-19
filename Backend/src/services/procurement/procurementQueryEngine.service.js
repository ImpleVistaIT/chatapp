import { SapServiceCatalog } from "../../models/SapServiceCatalog.model.js";
import { resolveSapConnection } from "../sap/sapConnectionResolver.service.js";
import { fetchFromSap } from "../sap.service.js";
import { buildEntitySetQuery } from "../odataQueryBuilder.js";
import { generateJson } from "../llm/ollama.client.js";

function cleanString(value) {
  return String(value ?? "").trim();
}

function normalizeText(value) {
  return cleanString(value).toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim();
}

function tokenize(value) {
  const text = normalizeText(value);
  return text ? text.split(" ").filter(Boolean) : [];
}

function unique(values) {
  return [...new Set((Array.isArray(values) ? values : []).map((value) => cleanString(value)).filter(Boolean))];
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function compactField(field) {
  return {
    name: cleanString(field?.name),
    label: cleanString(field?.label),
    type: cleanString(field?.type),
    semantics: cleanString(field?.semantics),
    unitField: cleanString(field?.unitField),
  };
}

function compactCatalog(catalog) {
  return {
    owner: cleanString(catalog?.owner),
    systemId: cleanString(catalog?.systemId).toUpperCase(),
    serviceName: cleanString(catalog?.serviceName),
    entitySet: cleanString(catalog?.entitySet),
    entityTypeName: cleanString(catalog?.entityTypeName),
    labelsText: cleanString(catalog?.labelsText).slice(0, 1200),
    domainHints: unique(catalog?.domainHints).slice(0, 20),
    fields: safeArray(catalog?.fields).map(compactField).slice(0, 40),
  };
}

function scoreCatalog(query, catalog) {
  const queryTokens = tokenize(query);
  const candidateText = normalizeText([
    catalog?.serviceName,
    catalog?.entitySet,
    catalog?.entityTypeName,
    catalog?.labelsText,
    ...(Array.isArray(catalog?.domainHints) ? catalog.domainHints : []),
    ...(Array.isArray(catalog?.fields) ? catalog.fields.flatMap((field) => [field?.name, field?.label, field?.semantics]) : []),
  ].filter(Boolean).join(" "));
  const candidateTokens = tokenize(candidateText);
  const candidateSet = new Set(candidateTokens);

  let score = 0;
  for (const token of queryTokens) {
    if (candidateSet.has(token)) score += 3;
    else if (candidateTokens.some((candidateToken) => candidateToken.includes(token) || token.includes(candidateToken))) score += 1;
  }

  return score;
}

function selectTopCatalogs(query, catalogs, limit = 5) {
  return (Array.isArray(catalogs) ? catalogs : [])
    .map((catalog) => ({ catalog, score: scoreCatalog(query, catalog) }))
    .sort((left, right) => right.score - left.score)
    .slice(0, Math.max(1, Number(limit) || 5))
    .map((item) => ({ ...compactCatalog(item.catalog), score: item.score }));
}

function buildGraphRagPrompt({ query, candidates }) {
  return `You are a GraphRAG-based procurement query interpreter. Use only the provided metadata context. Do not invent field names. Return JSON only.\n\nUser query: ${JSON.stringify(String(query || ""))}\n\nCandidate metadata: ${JSON.stringify(candidates, null, 2)}\n\nReturn JSON with this shape:\n{\n  "matchFound": true,\n  "confidence": 0.0,\n  "target": { "serviceName": "", "entitySet": "", "entityTypeName": "", "displayName": "" },\n  "metric": "count|sum|average|group_by|list",\n  "measureField": null,\n  "filters": [],\n  "groupBy": [],\n  "sortBy": [],\n  "pagination": { "limit": 100, "offset": 0 }\n}`;
}

function metricFromText(text) {
  const value = normalizeText(text);
  if (["count", "how many", "number of", "count of"].some((phrase) => value.includes(phrase))) return "count";
  if (["sum", "total"].some((phrase) => value.includes(phrase))) return "sum";
  if (["average", "avg", "mean"].some((phrase) => value.includes(phrase))) return "average";
  if (["group by", "grouped by"].some((phrase) => value.includes(phrase))) return "group_by";
  return "list";
}

function resolveFieldName(reference, catalog) {
  const ref = normalizeText(reference);
  if (!ref) return null;
  const fields = safeArray(catalog?.fields);

  const exact = fields.find((field) => normalizeText(field?.name) === ref || normalizeText(field?.label) === ref);
  if (exact?.name) return exact.name;

  const contains = fields.find((field) => {
    const text = normalizeText([field?.name, field?.label, field?.semantics, field?.unitField].filter(Boolean).join(" "));
    return text.includes(ref) || ref.includes(text);
  });
  if (contains?.name) return contains.name;

  let best = { name: null, score: 0 };
  for (const field of fields) {
    const fieldTokens = tokenize([field?.name, field?.label, field?.semantics, field?.unitField].filter(Boolean).join(" "));
    const overlap = queryTokenOverlap(tokenize(ref), fieldTokens);
    if (overlap > best.score) best = { name: field?.name || null, score: overlap };
  }

  return best.score > 0 ? best.name : null;
}

function queryTokenOverlap(leftTokens, rightTokens) {
  const left = Array.isArray(leftTokens) ? leftTokens : [];
  const right = new Set(Array.isArray(rightTokens) ? rightTokens : []);
  if (!left.length || !right.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits / Math.max(left.length, right.size);
}

function normalizeFilter(filter, catalog) {
  if (!filter || typeof filter !== "object") return null;
  const field = resolveFieldName(filter.field || filter.name || filter.column, catalog);
  if (!field) return null;

  const operator = normalizeText(filter.operator || filter.op || "eq");
  const type = normalizeText(filter.type || "string");
  const value = filter.value ?? filter.from ?? filter.to ?? null;
  if (value == null || value === "") return null;
  if (!["eq", "ne", "gt", "ge", "lt", "le", "contains"].includes(operator)) return null;

  return { field, operator, type, value };
}

function normalizeSort(sort, catalog) {
  if (!sort || typeof sort !== "object") return null;
  const field = resolveFieldName(sort.field || sort.name || sort.column, catalog);
  if (!field) return null;
  return { field, direction: normalizeText(sort.direction || sort.dir) === "desc" ? "desc" : "asc" };
}

function normalizeCanonicalQuery(raw, catalog) {
  const target = raw?.target || {};
  const metric = metricFromText(raw?.metric || raw?.query || raw?.question || "");
  const filters = safeArray(raw?.filters).map((filter) => normalizeFilter(filter, catalog)).filter(Boolean);
  const groupBy = unique(safeArray(raw?.groupBy).map((field) => resolveFieldName(field, catalog)).filter(Boolean));
  const sortBy = safeArray(raw?.sortBy).map((sort) => normalizeSort(sort, catalog)).filter(Boolean);
  const measureField = resolveFieldName(raw?.measureField, catalog) || null;

  return {
    target: {
      serviceName: cleanString(target.serviceName || catalog?.serviceName),
      entitySet: cleanString(target.entitySet || catalog?.entitySet),
      entityTypeName: cleanString(target.entityTypeName || catalog?.entityTypeName),
      displayName: cleanString(target.displayName || catalog?.entityTypeName || catalog?.entitySet || "records"),
    },
    metric,
    measureField,
    filters,
    groupBy,
    sortBy,
    pagination: {
      limit: Math.max(1, Number(raw?.pagination?.limit || raw?.limit || 100)),
      offset: Math.max(0, Number(raw?.pagination?.offset || raw?.offset || 0)),
    },
  };
}

function isSingleDayDateRange(filters, index) {
  const current = filters[index];
  const next = filters[index + 1];
  if (!current || !next) return null;
  if (current.field !== next.field) return null;
  if (current.type !== next.type) return null;
  if (current.operator !== "ge" || next.operator !== "lt") return null;

  const start = String(current.value || "");
  const end = String(next.value || "");
  if (!start.includes("T00:00:00") || !end.includes("T00:00:00")) return null;

  const startDate = new Date(start);
  const endDate = new Date(end);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) return null;

  const oneDayMs = 24 * 60 * 60 * 1000;
  if (endDate.getTime() - startDate.getTime() !== oneDayMs) return null;

  return {
    field: current.field,
    type: current.type,
    value: start.slice(0, 10),
  };
}

function normalizeCountCanonicalQuery(canonicalQuery) {
  const filters = safeArray(canonicalQuery?.filters);
  if (!filters.length) return canonicalQuery;

  const normalizedFilters = [];
  for (let index = 0; index < filters.length; index += 1) {
    const collapsed = isSingleDayDateRange(filters, index);
    if (collapsed) {
      normalizedFilters.push({
        field: collapsed.field,
        operator: "eq",
        type: collapsed.type,
        value: collapsed.value,
      });
      index += 1;
      continue;
    }

    normalizedFilters.push(filters[index]);
  }

  return { ...canonicalQuery, filters: normalizedFilters };
}

function buildODataQuery({ catalog, canonicalQuery, limit, offset }) {
  const query = {};
  const selects = new Set();

  for (const filter of safeArray(canonicalQuery.filters)) selects.add(filter.field);
  for (const groupField of safeArray(canonicalQuery.groupBy)) selects.add(groupField);
  for (const sort of safeArray(canonicalQuery.sortBy)) selects.add(sort.field);
  if (canonicalQuery.measureField) selects.add(canonicalQuery.measureField);

  if (selects.size > 0) query.$select = [...selects].join(",");

  const filterParts = [];
  for (const filter of safeArray(canonicalQuery.filters)) {
    const value = String(filter.value).replace(/'/g, "''");
    if (filter.type === "datetime" || /date/i.test(filter.type)) {
      const normalized = value.includes("T") ? value : `${value}T00:00:00`;
      filterParts.push(`${filter.field} ${filter.operator} datetime'${normalized}'`);
      continue;
    }
    if (filter.operator === "contains") {
      filterParts.push(`contains(${filter.field},'${value}')`);
      continue;
    }
    filterParts.push(`${filter.field} ${filter.operator} '${value}'`);
  }
  if (filterParts.length > 0) query.$filter = filterParts.join(" and ");

  const orderParts = safeArray(canonicalQuery.sortBy).map((sort) => `${sort.field} ${sort.direction}`);
  if (orderParts.length > 0) query.$orderby = orderParts.join(",");

  if (Number.isFinite(Number(limit))) query.$top = String(Math.min(Number(limit), 200));
  if (Number.isFinite(Number(offset)) && Number(offset) >= 0) query.$skip = String(Number(offset));
  query.$inlinecount = "allpages";

  return buildEntitySetQuery(catalog.entitySet, query, { maxTop: 200 });
}

function buildCountODataQuery({ catalog, canonicalQuery }) {
  const query = {};

  const filterParts = [];
  for (const filter of safeArray(canonicalQuery.filters)) {
    const value = String(filter.value).replace(/'/g, "''");
    if (filter.type === "datetime" || /date/i.test(filter.type)) {
      const normalized = value.includes("T") ? value : `${value}T00:00:00`;
      filterParts.push(`${filter.field} ${filter.operator} datetime'${normalized}'`);
      continue;
    }
    if (filter.operator === "contains") {
      filterParts.push(`contains(${filter.field},'${value}')`);
      continue;
    }
    filterParts.push(`${filter.field} ${filter.operator} '${value}'`);
  }

  if (filterParts.length > 0) {
    query.$filter = filterParts.join(" and ");
  }

  return buildEntitySetQuery(`${catalog.entitySet}/$count`, query, { maxTop: 200 });
}

function getRows(sapData) {
  return Array.isArray(sapData?.d?.results) ? sapData.d.results : [];
}

function getCount(sapData) {
  const raw = sapData?.d?.__count ?? sapData?.__count ?? null;
  const num = Number(raw);
  return Number.isFinite(num) ? num : null;
}

async function fetchAllPages({ system, sapAuth, catalog, canonicalQuery, maxRows = 5000 }) {
  const rows = [];
  let offset = Number(canonicalQuery.pagination.offset || 0);
  let totalCount = null;
  const pageSize = Math.min(200, Math.max(1, Number(canonicalQuery.pagination.limit || 100)));

  while (rows.length < maxRows) {
    const relativePath = buildODataQuery({ catalog, canonicalQuery, limit: pageSize, offset });
    const sapData = await fetchFromSap({ system, service: catalog, relativePath }, sapAuth);
    const pageRows = getRows(sapData);
    totalCount = getCount(sapData) ?? totalCount;
    rows.push(...pageRows);

    if (pageRows.length < pageSize) break;
    offset += pageRows.length;
  }

  return { rows: rows.slice(0, maxRows), totalCount };
}

async function fetchCountOnly({ system, sapAuth, catalog, canonicalQuery }) {
  const relativePath = buildCountODataQuery({ catalog, canonicalQuery });
  const sapData = await fetchFromSap({ system, service: catalog, relativePath }, sapAuth);
  const rawCount = Number(sapData?.d?.__count ?? sapData?.__count ?? 0);

  return {
    totalCount: Number.isFinite(rawCount) ? rawCount : 0,
    relativePath,
  };
}

function aggregateRows(rows, canonicalQuery) {
  const metric = canonicalQuery.metric;
  const groupBy = safeArray(canonicalQuery.groupBy);
  const measureField = canonicalQuery.measureField;
  const sourceRows = Array.isArray(rows) ? rows : [];

  if (metric === "count" && groupBy.length === 0) {
    return { rows: [], value: sourceRows.length };
  }

  if (metric === "sum" || metric === "average") {
    const values = sourceRows.map((row) => Number(row?.[measureField])).filter((value) => Number.isFinite(value));
    const sum = values.reduce((acc, value) => acc + value, 0);
    return { rows: [], value: metric === "sum" ? sum : (values.length ? sum / values.length : 0) };
  }

  if (groupBy.length > 0) {
    const buckets = new Map();

    for (const row of sourceRows) {
      const key = groupBy.map((field) => cleanString(row?.[field])).join(" | ");
      const bucket = buckets.get(key) || { key, rows: [] };
      bucket.rows.push(row);
      buckets.set(key, bucket);
    }

    const groupedRows = [...buckets.values()].map((bucket) => {
      const out = { group: bucket.key, count: bucket.rows.length };
      if (metric === "sum" && measureField) {
        out.sum = bucket.rows.reduce((acc, row) => acc + (Number(row?.[measureField]) || 0), 0);
      }
      if (metric === "average" && measureField) {
        const values = bucket.rows.map((row) => Number(row?.[measureField])).filter((value) => Number.isFinite(value));
        const sum = values.reduce((acc, value) => acc + value, 0);
        out.average = values.length ? sum / values.length : 0;
      }
      return out;
    });

    return { rows: groupedRows, value: groupedRows.length };
  }

  return { rows: sourceRows, value: sourceRows.length };
}

function buildAnswer(canonicalQuery, totalCount, aggregated) {
  const label = canonicalQuery.target.displayName || canonicalQuery.target.entityTypeName || canonicalQuery.target.entitySet || "records";

  if (canonicalQuery.metric === "count" && canonicalQuery.groupBy.length === 0) {
    return `${aggregated.value} ${label} match your criteria.`;
  }

  if (canonicalQuery.metric === "count" && canonicalQuery.groupBy.length > 0) {
    return `Here is the count of ${label} grouped by ${canonicalQuery.groupBy.join(", ")}.`;
  }

  if (canonicalQuery.metric === "sum") {
    return `The total ${canonicalQuery.measureField || "value"} for ${label} is ${aggregated.value}.`;
  }

  if (canonicalQuery.metric === "average") {
    return `The average ${canonicalQuery.measureField || "value"} for ${label} is ${aggregated.value}.`;
  }

  if ((totalCount ?? aggregated.value) === 0) {
    return `No ${label} were found.`;
  }

  return `Here are the matching ${label} records.`;
}

async function interpretQuery({ query, catalogs }) {
  const candidates = selectTopCatalogs(query, catalogs, 5);
  if (!candidates.length) return null;
  if (candidates.length === 1) {
    return normalizeCanonicalQuery({ target: candidates[0], metric: metricFromText(query), pagination: { limit: 100, offset: 0 } }, candidates[0]);
  }

  const llm = await generateJson({
    prompt: buildGraphRagPrompt({ query, candidates }),
    schemaHint: "procurement-graphrag-query-model",
    timeoutMs: Number(process.env.PROCUREMENT_QUERY_TIMEOUT_MS || 20000),
  });

  const raw = llm?.ok && llm?.data ? llm.data : { target: candidates[0], metric: metricFromText(query), pagination: { limit: 100, offset: 0 } };
  const selected = candidates.find((candidate) => normalizeText(candidate.serviceName) === normalizeText(raw?.target?.serviceName) || normalizeText(candidate.entitySet) === normalizeText(raw?.target?.entitySet) || normalizeText(candidate.entityTypeName) === normalizeText(raw?.target?.entityTypeName)) || candidates[0];

  return normalizeCanonicalQuery(raw, selected);
}

export async function executeProcurementQuery({ owner = "local", query, systemId, sapUser }) {
  const cleanQuery = cleanString(query);
  if (!cleanQuery) throw new Error("query is required");
  if (!cleanString(systemId)) throw new Error("systemId is required");
  if (!cleanString(sapUser)) throw new Error("sapUser is required");

  const connection = await resolveSapConnection({ owner, systemId, sapUser });
  const catalogs = await SapServiceCatalog.find({ owner: { $in: [owner, "local"] }, systemId: String(systemId).trim().toUpperCase(), isActive: true }).sort({ updatedAt: -1 }).lean();

  if (!catalogs.length) {
    return { ok: false, message: "No active procurement metadata was found for this SAP system.", canonicalQuery: null, result: null };
  }

  const canonicalQuery = await interpretQuery({ query: cleanQuery, catalogs });
  if (!canonicalQuery?.target?.serviceName || !canonicalQuery?.target?.entitySet) {
    return { ok: false, message: "I could not map the question to a known SAP entity.", canonicalQuery, result: null };
  }

  const target = catalogs.find((catalog) => normalizeText(catalog.serviceName) === normalizeText(canonicalQuery.target.serviceName) || normalizeText(catalog.entitySet) === normalizeText(canonicalQuery.target.entitySet) || normalizeText(catalog.entityTypeName) === normalizeText(canonicalQuery.target.entityTypeName)) || catalogs[0];

  const isCountOnly = canonicalQuery.metric === "count" && canonicalQuery.groupBy.length === 0;
  const effectiveCanonicalQuery = isCountOnly ? normalizeCountCanonicalQuery(canonicalQuery) : canonicalQuery;
  const fetched = isCountOnly
    ? await fetchCountOnly({ system: connection.system, sapAuth: connection.sapAuth, catalog: target, canonicalQuery: effectiveCanonicalQuery })
    : await fetchAllPages({ system: connection.system, sapAuth: connection.sapAuth, catalog: target, canonicalQuery: effectiveCanonicalQuery });

  const aggregated = isCountOnly
    ? { rows: [], value: fetched.totalCount }
    : aggregateRows(fetched.rows, effectiveCanonicalQuery);
  const message = buildAnswer(effectiveCanonicalQuery, fetched.totalCount ?? aggregated.value, aggregated);

  return {
    ok: true,
    message,
    canonicalQuery: effectiveCanonicalQuery,
    result: {
      count: aggregated.value,
      rows: aggregated.rows,
      totalCount: fetched.totalCount ?? aggregated.value,
      sapRequest: buildODataQuery({ catalog: target, canonicalQuery: effectiveCanonicalQuery, limit: effectiveCanonicalQuery.pagination.limit, offset: effectiveCanonicalQuery.pagination.offset }),
      sapCountRequest: isCountOnly ? buildCountODataQuery({ catalog: target, canonicalQuery: effectiveCanonicalQuery }) : null,
      serviceName: target.serviceName,
      entitySet: target.entitySet,
      entityTypeName: target.entityTypeName,
      target: effectiveCanonicalQuery.target,
      metric: effectiveCanonicalQuery.metric,
      groupBy: effectiveCanonicalQuery.groupBy,
      measureField: effectiveCanonicalQuery.measureField,
      filters: effectiveCanonicalQuery.filters,
      sortBy: effectiveCanonicalQuery.sortBy,
      pagination: effectiveCanonicalQuery.pagination,
    },
  };
}

export {
  buildGraphRagPrompt,
  buildODataQuery,
  buildCountODataQuery,
  compactCatalog,
  compactField,
  normalizeCountCanonicalQuery,
  normalizeCanonicalQuery,
  normalizeFilter,
  normalizeSort,
  resolveFieldName,
  selectTopCatalogs,
};

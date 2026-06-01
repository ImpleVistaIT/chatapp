import { parseStringPromise } from "xml2js";
import crypto from "node:crypto";

function arr(v) {
  if (Array.isArray(v)) return v;
  if (v == null) return [];
  return [v];
}

function attr(node, key, fallback = "") {
  return node?.$?.[key] ?? fallback;
}

function toBoolSapFlag(v, defaultValue = true) {
  if (v == null || v === "") return defaultValue;
  return String(v).toLowerCase() === "true";
}

function toNum(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function cleanLabel(s) {
  return String(s || "").replace(/\s+/g, " ").trim();
}

function sha256(input) {
  return crypto.createHash("sha256").update(String(input || ""), "utf8").digest("hex");
}

function localName(name) {
  const s = String(name || "");
  const i = s.indexOf(":");
  return i >= 0 ? s.slice(i + 1) : s;
}

function findFirstKey(obj, wantedLocalName) {
  if (!obj || typeof obj !== "object") return null;
  for (const key of Object.keys(obj)) {
    if (localName(key) === wantedLocalName) return obj[key];
  }
  return null;
}

function normalizeProperty(prop) {
  return {
    name: attr(prop, "Name", ""),
    label: cleanLabel(attr(prop, "sap:label", "")),
    type: attr(prop, "Type", ""),
    nullable: attr(prop, "Nullable", "true") !== "false",
    maxLength: toNum(attr(prop, "MaxLength", null)),
    precision: toNum(attr(prop, "Precision", null)),
    scale: toNum(attr(prop, "Scale", null)),
    filterable: toBoolSapFlag(attr(prop, "sap:filterable", null), true),
    sortable: toBoolSapFlag(attr(prop, "sap:sortable", null), true),
    creatable: toBoolSapFlag(attr(prop, "sap:creatable", null), false),
    updatable: toBoolSapFlag(attr(prop, "sap:updatable", null), false),
    semantics: attr(prop, "sap:semantics", ""),
    unitField: attr(prop, "sap:unit", ""),
  };
}

function buildDomainHints({ serviceName, entityTypeName, entitySet, fields }) {
  const bag = new Set();

  for (const v of [serviceName, entityTypeName, entitySet]) {
    String(v || "")
      .split(/[^a-zA-Z0-9]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .forEach((x) => bag.add(x));
  }

  for (const f of fields || []) {
    String(f?.name || "")
      .split(/[^a-zA-Z0-9]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .forEach((x) => bag.add(x));

    String(f?.label || "")
      .split(/[^a-zA-Z0-9]+/)
      .map((x) => x.trim().toLowerCase())
      .filter(Boolean)
      .forEach((x) => bag.add(x));
  }

  return Array.from(bag).slice(0, 200);
}

function buildLabelsText(fields) {
  return (fields || [])
    .map((f) => {
      const name = String(f?.name || "").trim();
      const label = String(f?.label || "").trim();
      if (!name) return "";
      return label ? `${name}: ${label}` : name;
    })
    .filter(Boolean)
    .join(" | ");
}

export async function parseODataMetadataXml({
  xml,
  owner = "local",
  systemId,
  metadataUrl = "",
}) {
  if (!xml || !String(xml).trim()) {
    throw new Error("metadata xml is required");
  }
  if (!systemId) {
    throw new Error("systemId is required");
  }

  const parsed = await parseStringPromise(xml, {
    explicitArray: false,
    mergeAttrs: false,
    trim: true,
  });

  const edmx = findFirstKey(parsed, "Edmx");
  const dataServices = findFirstKey(edmx, "DataServices");
  const schema = arr(findFirstKey(dataServices, "Schema"))[0];

  if (!schema) {
    throw new Error("No Schema found in OData metadata");
  }

  const namespace = attr(schema, "Namespace", "");
  const entityContainer = arr(findFirstKey(schema, "EntityContainer"))[0];
  const entityContainerName = attr(entityContainer, "Name", "");

  const entityTypes = arr(findFirstKey(schema, "EntityType"));
  const entitySets = arr(findFirstKey(entityContainer, "EntitySet"));

  const entityTypeMap = new Map();

  for (const et of entityTypes) {
    const entityTypeName = attr(et, "Name", "");
    if (!entityTypeName) continue;

    const keyNode = findFirstKey(et, "Key");
    const keyRefs = arr(findFirstKey(keyNode, "PropertyRef"));
    const keys = keyRefs.map((k) => attr(k, "Name", "")).filter(Boolean);

    const properties = arr(findFirstKey(et, "Property"))
      .map(normalizeProperty)
      .filter((p) => p.name);

    entityTypeMap.set(entityTypeName, {
      entityTypeName,
      keys,
      fields: properties,
    });
  }

  const records = [];

  for (const es of entitySets) {
    const entitySet = attr(es, "Name", "");
    const entityTypeFull = attr(es, "EntityType", "");
    const entityTypeName = entityTypeFull.includes(".")
      ? entityTypeFull.split(".").pop()
      : entityTypeFull;

    if (!entitySet || !entityTypeName) continue;

    const typeInfo = entityTypeMap.get(entityTypeName);
    if (!typeInfo) continue;

    const serviceName = namespace;

    const fields = typeInfo.fields || [];
    const keys = typeInfo.keys || [];
    const domainHints = buildDomainHints({
      serviceName,
      entityTypeName,
      entitySet,
      fields,
    });
    const labelsText = buildLabelsText(fields);

    records.push({
      owner,
      systemId: String(systemId).trim().toUpperCase(),
      serviceName,
      entityContainerName,
      entitySet,
      entityTypeName,
      namespace,
      metadataUrl,
      keys,
      fields,
      domainHints,
      labelsText,
      metadataHash: sha256(xml),
      lastIngestedAt: new Date(),
      isActive: true,
    });
  }

  return records;
}
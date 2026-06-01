import axios from "axios";
import { getPoAllowlistFallback } from "./extractor/poFieldSchema.js";

const CACHE_MS = Number(process.env.SAP_METADATA_CACHE_MS || 60 * 60 * 1000);

const cacheByKey = new Map();

function normalizeKey(v) {
  return String(v || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function getStaticAllowlist(service, entityTypeName) {
  const serviceName = normalizeKey(service?.serviceName);
  const et = normalizeKey(entityTypeName);

  const isPoService = serviceName === "zmmpodetailssrv";
  const isPoEntity =
    et === "podetails" ||
    et === "podetail" ||
    et === "purchaseorderdetails";

  if (isPoService && isPoEntity) {
    return getPoAllowlistFallback();
  }

  return null;
}

function buildCacheKey({ system, service, entityTypeName }) {
  const protocol = String(system?.protocol || service?.protocol || "https").toLowerCase();
  const host = String(system?.host || "").trim();
  const port = String(system?.port ?? "").trim();
  const serviceName = String(service?.serviceName || "").trim();
  const et = String(entityTypeName || "").trim();

  return `${protocol}://${host}:${port}|${serviceName}|${et}`;
}

function getSapServiceRoot({ system, service }) {
  const protocol = String(system?.protocol || service?.protocol || "https").toLowerCase();
  const host = String(system?.host || "").trim();
  const port = String(system?.port ?? "").trim();
  const serviceName = String(service?.serviceName || "").trim();

  if (!host) throw new Error("SAP host missing");
  if (!port) throw new Error("SAP port missing");
  if (!serviceName) throw new Error("SAP serviceName missing");

  const base = `${protocol}://${host}:${port}/sap/opu/odata/sap/${serviceName}/`;
  return base.endsWith("/") ? base : `${base}/`;
}

function looksLikeHtml(s) {
  const t = String(s || "").toLowerCase();
  return t.includes("<html") || t.includes("<head") || t.includes("<title") || t.includes("<body");
}

function excerpt(s, max = 220) {
  const t = String(s || "").replace(/\s+/g, " ").trim();
  return t.length > max ? `${t.slice(0, max)}…` : t;
}

function assertNotHtmlLogin(body, status) {
  const b = String(body || "");
  if (looksLikeHtml(b)) {
    throw new Error(`SAP Gateway returned an HTML error page (HTTP ${status}). Check system URL and credentials.`);
  }
}

function isTransientSapNetworkError(err) {
  const code = String(err?.code || err?.cause?.code || "").toUpperCase();
  return [
    "ECONNRESET",
    "ETIMEDOUT",
    "ECONNABORTED",
    "ENOTFOUND",
    "EHOSTUNREACH",
    "ECONNREFUSED",
    "ERR_TLS_CERT_ALTNAME_INVALID",
    "DEPTH_ZERO_SELF_SIGNED_CERT",
  ].includes(code);
}

function createWrappedError(message, originalError) {
  const wrapped = new Error(message);
  wrapped.code = originalError?.code || originalError?.cause?.code || "";
  wrapped.cause = originalError;
  return wrapped;
}

function formatAxiosNetworkError(err, contextLabel) {
  const code = String(err?.code || err?.cause?.code || "").toUpperCase();
  const base = contextLabel || "SAP request failed";

  if (code === "ECONNRESET") {
    return createWrappedError(`${base}: SAP connection was reset while reading response.`, err);
  }
  if (code === "ETIMEDOUT" || code === "ECONNABORTED") {
    return createWrappedError(`${base}: SAP request timed out.`, err);
  }
  if (code === "ENOTFOUND") {
    return createWrappedError(`${base}: SAP host could not be resolved.`, err);
  }
  if (code === "EHOSTUNREACH") {
    return createWrappedError(`${base}: SAP host is unreachable.`, err);
  }
  if (code === "ECONNREFUSED") {
    return createWrappedError(`${base}: SAP server refused the connection.`, err);
  }
  if (code.includes("TLS") || code.includes("CERT")) {
    return createWrappedError(`${base}: TLS/SSL validation failed while connecting to SAP.`, err);
  }

  return createWrappedError(`${base}: ${err?.message || "Unknown network error."}`, err);
}

async function authCheck({ system, service, authOverride = null, opts = {} }) {
  const root = getSapServiceRoot({ system, service });
  const urlObj = new URL("$metadata", root);
  urlObj.searchParams.set("_", String(Date.now()));
  const url = urlObj.toString();

  const allowEnvFallback = Boolean(opts?.allowEnvFallback);

  const username = authOverride?.username || (allowEnvFallback ? process.env.SAP_USER : "") || "";
  const password = authOverride?.password || (allowEnvFallback ? process.env.SAP_PASSWORD : "") || "";

  if (!username || !password) {
    throw new Error(
      allowEnvFallback
        ? "SAP credentials missing for auth check (no authOverride and SAP_USER/SAP_PASSWORD empty)"
        : "SAP credentials missing for auth check (authOverride required)"
    );
  }

  let res;
  try {
    res = await axios.get(url, {
      headers: {
        Accept: "application/xml",
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
      auth: { username, password },
      timeout: 30000,
      validateStatus: () => true,
    });
  } catch (err) {
    throw formatAxiosNetworkError(err, "SAP auth check failed");
  }

  if (res.status < 200 || res.status >= 300) {
    const body = String(res.data || "");

    if (res.status === 401) throw new Error("Invalid SAP username or password.");
    if (res.status === 403) {
      if (body.includes("/IWFND/MED/170")) {
        throw new Error("OData service not found/active on this SAP system. Check service name and activation.");
      }
      throw new Error("Access denied by SAP (403). Check authorizations / service activation.");
    }

    assertNotHtmlLogin(body, res.status);
    throw new Error(`SAP auth check failed (${res.status}): ${excerpt(body)}`);
  }

  assertNotHtmlLogin(res.data, res.status);
  return true;
}

async function fetchMetadataXml({ system, service, authOverride = null, opts = {} }) {
  const url = new URL("$metadata", getSapServiceRoot({ system, service })).toString();

  const allowEnvFallback = Boolean(opts?.allowEnvFallback);

  const username = authOverride?.username || (allowEnvFallback ? process.env.SAP_USER : "") || "";
  const password = authOverride?.password || (allowEnvFallback ? process.env.SAP_PASSWORD : "") || "";

  if (!username || !password) {
    throw new Error(
      allowEnvFallback
        ? "SAP credentials missing for $metadata (no authOverride and SAP_USER/SAP_PASSWORD empty)"
        : "SAP credentials missing for $metadata (authOverride required)"
    );
  }

  let res;
  try {
    res = await axios.get(url, {
      headers: { Accept: "application/xml" },
      auth: { username, password },
      timeout: 30000,
      validateStatus: () => true,
    });
  } catch (err) {
    throw formatAxiosNetworkError(err, "SAP metadata fetch failed");
  }

  if (res.status < 200 || res.status >= 300) {
    const body = String(res.data || "");

    if (res.status === 401) {
      throw new Error("Invalid SAP username or password.");
    }

    if (res.status === 403) {
      if (body.includes("/IWFND/MED/170")) {
        throw new Error("OData service not found/active on this SAP system. Check service name and activation.");
      }
      throw new Error("Access denied by SAP (403). Check authorizations / service activation.");
    }

    assertNotHtmlLogin(body, res.status);
    throw new Error(`$metadata failed (${res.status}): ${excerpt(body)}`);
  }

  assertNotHtmlLogin(res.data, res.status);
  return String(res.data);
}

function escapeRegExp(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parseEntityTypeBlock(xml, entityTypeName) {
  const et = escapeRegExp(entityTypeName);

  const re = new RegExp(
    `<(?:\\w+:)?EntityType\\s+[^>]*Name="${et}"[\\s\\S]*?<\\/(?:\\w+:)?EntityType>`,
    "i"
  );

  const m = String(xml || "").match(re);
  if (!m) {
    throw new Error(`Could not find EntityType Name="${entityTypeName}" in $metadata`);
  }
  return m[0];
}

function parseFieldsAndLabelsFromEntityXml(entityXml) {
  const props = [...String(entityXml || "").matchAll(/<(?:\w+:)?Property\s+[^>]*Name="([^"]+)"[^>]*>/gi)];

  const fields = [];
  const labels = {};

  for (const p of props) {
    const fullTag = p[0];
    const name = p[1];

    if (!name) continue;
    fields.push(name);

    const labelMatch = fullTag.match(/sap:label="([^"]+)"/i);
    if (labelMatch?.[1]) labels[name] = labelMatch[1];
  }

  return {
    fields: Array.from(new Set(fields)).filter(Boolean),
    labels,
  };
}

async function refreshCache({ system, service, entityTypeName, authOverride = null, allowEnvFallback = false }) {
  const xml = await fetchMetadataXml({ system, service, authOverride, opts: { allowEnvFallback } });
  const entityXml = parseEntityTypeBlock(xml, entityTypeName);
  const { fields, labels } = parseFieldsAndLabelsFromEntityXml(entityXml);

  const key = buildCacheKey({ system, service, entityTypeName });
  cacheByKey.set(key, { ts: Date.now(), fields, labels });
}

export async function getAllowedFieldsWithLabels({
  system,
  service,
  entityTypeName,
  authOverride = null,
  allowEnvFallback = false,
  validateAuth = false,
} = {}) {
  if (!system) throw new Error("system is required");
  if (!service) throw new Error("service is required");
  if (!entityTypeName) throw new Error("entityTypeName is required");

  const key = buildCacheKey({ system, service, entityTypeName });
  const now = Date.now();
  const cached = cacheByKey.get(key);

  const hasFreshCache =
    Boolean(cached?.fields && cached?.labels) && now - cached.ts < CACHE_MS;

  const hasAnyCache =
    Boolean(cached?.fields && cached?.labels);

  if (validateAuth) {
    await authCheck({ system, service, authOverride, opts: { allowEnvFallback } });
  }

  if (hasFreshCache) {
    return { fields: cached.fields, labels: cached.labels };
  }

  try {
    await refreshCache({ system, service, entityTypeName, authOverride, allowEnvFallback });
    const updated = cacheByKey.get(key);
    return { fields: updated?.fields || [], labels: updated?.labels || {} };
  } catch (err) {
    console.log("[ALLOWLIST] metadata fetch failed", {
      serviceName: service?.serviceName,
      entityTypeName,
      error: err?.message,
      transient: isTransientSapNetworkError(err),
      systemId: system?.systemId || null,
      host: system?.host || null,
      port: system?.port || null,
      serviceHost: service?.host || null,
      servicePort: service?.port || null,
    });

    if (!validateAuth && hasAnyCache && isTransientSapNetworkError(err)) {
      return { fields: cached.fields, labels: cached.labels };
    }

    if (!validateAuth && isTransientSapNetworkError(err)) {
      const staticFallback = getStaticAllowlist(service, entityTypeName);
      if (staticFallback) {
        console.log("[ALLOWLIST] using static fallback", {
          serviceName: service?.serviceName,
          entityTypeName,
          systemId: system?.systemId || null,
          host: system?.host || null,
          port: system?.port || null,
        });
        return staticFallback;
      }
    }

    throw err;
  }
}

export async function getAllowedFields(args = {}) {
  const { fields } = await getAllowedFieldsWithLabels(args);
  return fields;
}

export async function getFieldLabels(args = {}) {
  const { labels } = await getAllowedFieldsWithLabels(args);
  return labels || {};
}
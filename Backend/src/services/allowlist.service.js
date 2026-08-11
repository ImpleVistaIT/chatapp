import axios from "axios";
import { parseStringPromise } from "xml2js";
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

function cleanString(value) {
  return String(value ?? "").trim();
}

function mapSapStatus(status) {
  const code = Number(status);
  if (code === 401) return 401;
  if (code === 403) return 403;
  if (code === 404) return 404;
  if (code === 408) return 408;
  if (code === 500) return 500;
  if (code === 502) return 502;
  if (code === 503) return 503;
  if (code === 504) return 504;
  return Number.isFinite(code) && code >= 400 ? code : 500;
}

function parseSapErrorXml(xmlText) {
  const text = cleanString(xmlText);
  if (!text || !text.startsWith("<")) return null;

  const codeMatch = text.match(/<code>([\s\S]*?)<\/code>/i);
  const messageMatch = text.match(/<message(?:\s[^>]*)?>([\s\S]*?)<\/message>/i);
  const messageValueMatch = text.match(/<message[^>]*>\s*<[^>]*value>([\s\S]*?)<\/[^>]*value>/i);

  const code = cleanString(codeMatch?.[1] || "");
  const message = cleanString(messageValueMatch?.[1] || messageMatch?.[1] || "");

  return { code, message };
}

function attachSapErrorDetails(error, { status, requestUrl, responseBody, system, service, sapUser, context }) {
  error.status = mapSapStatus(status);
  error.requestUrl = requestUrl || error.requestUrl || null;
  error.responseBody = cleanString(responseBody || error.responseBody || "");
  error.sapCode = cleanString(error.sapCode || error?.responseData?.error?.code || "");
  error.sapMessage = cleanString(error.sapMessage || error.message || "");
  error.type =
    error.type ||
    (error.status === 401 ? "AUTHENTICATION_FAILED" :
      error.status === 403 ? "AUTHORIZATION_FAILED" :
      error.status === 404 ? "SERVICE_NOT_FOUND" :
      error.status === 408 ? "REQUEST_TIMEOUT" :
      error.status === 503 ? "SAP_UNAVAILABLE" :
      error.status === 504 ? "SAP_TIMEOUT" :
      error.status === 500 ? "SAP_RUNTIME_ERROR" :
      "SAP_ERROR");

  console.error(`[${context}]`, {
    ts: new Date().toISOString(),
    status: error.status,
    sapCode: error.sapCode || null,
    sapMessage: error.sapMessage || null,
    requestUrl,
    systemId: system?.systemId || null,
    sapUser: sapUser || null,
    stack: error?.stack || null,
  });

  return error;
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
    const parsed = parseSapErrorXml(body);

    if (res.status === 401) {
      const error = new Error("Invalid SAP username or password.");
      error.status = 401;
      error.type = "AUTHENTICATION_FAILED";
      error.sapCode = parsed?.code || "";
      error.sapMessage = parsed?.message || error.message;
      error.responseBody = body;
      throw attachSapErrorDetails(error, {
        status: 401,
        requestUrl: url,
        responseBody: body,
        system,
        service,
        sapUser: authOverride?.username,
        context: "[SAP AUTH CHECK FAILED]",
      });
    }

    if (res.status === 403) {
      const error = new Error("SAP user is not authorized.");
      error.status = 403;
      error.type = "AUTHORIZATION_FAILED";
      error.sapCode = parsed?.code || "";
      error.sapMessage = parsed?.message || error.message;
      error.responseBody = body;
      throw attachSapErrorDetails(error, {
        status: 403,
        requestUrl: url,
        responseBody: body,
        system,
        service,
        sapUser: authOverride?.username,
        context: "[SAP AUTH CHECK FAILED]",
      });
    }

    assertNotHtmlLogin(body, res.status);
    const error = new Error(res.status >= 500 ? "SAP OData service encountered an internal runtime error." : `SAP auth check failed (${res.status})`);
    error.status = res.status;
    error.type = res.status >= 500 ? "SAP_RUNTIME_ERROR" : "SAP_ERROR";
    error.sapCode = parsed?.code || "";
    error.sapMessage = parsed?.message || error.message;
    error.responseBody = body;
    throw attachSapErrorDetails(error, {
      status: res.status,
      requestUrl: url,
      responseBody: body,
      system,
      service,
      sapUser: authOverride?.username,
      context: "[SAP AUTH CHECK FAILED]",
    });
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
    const parsed = parseSapErrorXml(body);

    if (res.status === 401) {
      const error = new Error("Invalid SAP username or password.");
      error.status = 401;
      error.type = "AUTHENTICATION_FAILED";
      error.sapCode = parsed?.code || "";
      error.sapMessage = parsed?.message || error.message;
      error.responseBody = body;
      throw attachSapErrorDetails(error, {
        status: 401,
        requestUrl: url,
        responseBody: body,
        system,
        service,
        sapUser: authOverride?.username,
        context: "[SAP METADATA FETCH FAILED]",
      });
    }

    if (res.status === 403) {
      const error = new Error("SAP user is not authorized.");
      error.status = 403;
      error.type = "AUTHORIZATION_FAILED";
      error.sapCode = parsed?.code || "";
      error.sapMessage = parsed?.message || error.message;
      error.responseBody = body;
      throw attachSapErrorDetails(error, {
        status: 403,
        requestUrl: url,
        responseBody: body,
        system,
        service,
        sapUser: authOverride?.username,
        context: "[SAP METADATA FETCH FAILED]",
      });
    }

    assertNotHtmlLogin(body, res.status);
    const error = new Error(res.status >= 500 ? "SAP OData service encountered an internal runtime error." : `$metadata failed (${res.status})`);
    error.status = res.status;
    error.type = res.status >= 500 ? "SAP_RUNTIME_ERROR" : "SAP_ERROR";
    error.sapCode = parsed?.code || "";
    error.sapMessage = parsed?.message || error.message;
    error.responseBody = body;
    throw attachSapErrorDetails(error, {
      status: res.status,
      requestUrl: url,
      responseBody: body,
      system,
      service,
      sapUser: authOverride?.username,
      context: "[SAP METADATA FETCH FAILED]",
    });
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

function hasEntitySetInMetadataXml(xml, entitySetName) {
  const target = String(entitySetName || "").trim();
  if (!target) return false;

  const pattern = new RegExp(
    `<(?:\\w+:)?EntitySet\\s+[^>]*Name="${escapeRegExp(target)}"[^>]*>`,
    "i"
  );

  return pattern.test(String(xml || ""));
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

export async function verifyEntitySetInMetadata({
  system,
  service,
  entitySetName,
  authOverride = null,
  allowEnvFallback = false,
} = {}) {
  if (!system) throw new Error("system is required");
  if (!service) throw new Error("service is required");
  if (!entitySetName) throw new Error("entitySetName is required");

  const xml = await fetchMetadataXml({ system, service, authOverride, opts: { allowEnvFallback } });
  if (!hasEntitySetInMetadataXml(xml, entitySetName)) {
    const err = new Error(
      `EntitySet "${entitySetName}" was not found in the service metadata for ${service?.serviceName || "unknown service"}.`
    );
    err.status = 404;
    err.code = "ENTITYSET_NOT_FOUND";
    err.details = {
      serviceName: service?.serviceName || null,
      entitySetName,
      systemId: system?.systemId || null,
    };
    throw err;
  }

  return true;
}

export async function getAllowedFields(args = {}) {
  const { fields } = await getAllowedFieldsWithLabels(args);
  return fields;
}

export async function getFieldLabels(args = {}) {
  const { labels } = await getAllowedFieldsWithLabels(args);
  return labels || {};
}
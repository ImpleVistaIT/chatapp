import axios from "axios";

/**
 * Dynamic allowlist service — builds allowed SAP field names + sap:label map from SAP OData $metadata.
 *
 * ✅ DOES NOT use SAP_BASE_URL anymore.
 * ✅ Works for PO and SO (or any service) using:
 *   - system: { protocol, host, port }
 *   - service: { serviceName }
 *   - entityTypeName: "Po_details" / "SALES_ORDER_DETAILS" / etc.
 *
 * Auth:
 * - Preferred: authOverride = { username, password } from DB creds (per systemId)
 * - Optional fallback: env SAP_USER/SAP_PASSWORD only when allowEnvFallback=true
 *
 * Caching:
 * - In-memory cache per (system + serviceName + entityTypeName) for CACHE_MS duration
 * - Override with env SAP_METADATA_CACHE_MS
 *
 * ✅ IMPORTANT FIXES (without removing your logic):
 * 1) Do NOT reuse cached metadata when validateAuth is requested (ensures wrong password is caught).
 * 2) Add an optional lightweight "auth check" call that MUST hit SAP even if cache is warm.
 *    This prevents "wrong password still logs in" when metadata is served from cache.
 */

const CACHE_MS = Number(process.env.SAP_METADATA_CACHE_MS || 60 * 60 * 1000); // 1 hour

// key => { ts, fields, labels }
const cacheByKey = new Map();

function buildCacheKey({ system, service, entityTypeName }) {
  const protocol = String(system?.protocol || "https").toLowerCase();
  const host = String(system?.host || "").trim();
  const port = String(system?.port ?? "").trim();
  const serviceName = String(service?.serviceName || "").trim();
  const et = String(entityTypeName || "").trim();

  return `${protocol}://${host}:${port}|${serviceName}|${et}`;
}

function getSapServiceRoot({ system, service }) {
  const protocol = String(system?.protocol || "https").toLowerCase();
  const host = String(system?.host || "").trim();
  const port = String(system?.port ?? "").trim();
  const serviceName = String(service?.serviceName || "").trim();

  if (!host) throw new Error("SAP system host missing");
  if (!port) throw new Error("SAP system port missing");
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

// ✅ NEW: small util so we don't treat any 2xx as ok when it returns an HTML login page
function assertNotHtmlLogin(body, status) {
  const b = String(body || "");
  if (looksLikeHtml(b)) {
    throw new Error(`SAP Gateway returned an HTML error page (HTTP ${status}). Check system URL and credentials.`);
  }
}

/**
 * ✅ NEW: Force an auth check even when cache is warm.
 * This is what fixes "wrong password still logs in" when metadata is cached.
 *
 * We call $metadata with Cache-Control: no-cache and a cache-busting query param,
 * so SAP must authenticate the request.
 */
async function authCheck({ system, service, authOverride = null, opts = {} }) {
  const root = getSapServiceRoot({ system, service });

  // cache-bust to prevent server/proxy caching
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

  const res = await axios.get(url, {
    headers: {
      Accept: "application/xml",
      "Cache-Control": "no-cache",
      Pragma: "no-cache",
    },
    auth: { username, password },
    timeout: 30000,
    validateStatus: () => true,
  });

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

  // even in 200, SAP might return HTML if something is off
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

  const res = await axios.get(url, {
    headers: { Accept: "application/xml" },
    auth: { username, password },
    timeout: 30000,
    validateStatus: () => true,
  });

  if (res.status < 200 || res.status >= 300) {
    const body = String(res.data || "");

    if (res.status === 401) {
      throw new Error("Invalid SAP Routername or password.");
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

/**
 * ✅ Main API used by controller.
 *
 * New param (optional): validateAuth
 * - When true, forces an SAP call even if metadata is cached, so wrong password is detected.
 */
export async function getAllowedFieldsWithLabels({
  system,
  service,
  entityTypeName,
  authOverride = null,
  allowEnvFallback = false,

  // ✅ NEW
  validateAuth = false,
} = {}) {
  if (!system) throw new Error("system is required");
  if (!service) throw new Error("service is required");
  if (!entityTypeName) throw new Error("entityTypeName is required");

  const key = buildCacheKey({ system, service, entityTypeName });
  const now = Date.now();
  const cached = cacheByKey.get(key);

  // ✅ if validateAuth requested, force auth check (even when cache is warm)
  if (validateAuth) {
    await authCheck({ system, service, authOverride, opts: { allowEnvFallback } });
  }

  // ✅ keep your cache behavior for speed (unless validateAuth is true AND cache is missing)
  if (cached?.fields && cached?.labels && now - cached.ts < CACHE_MS) {
    return { fields: cached.fields, labels: cached.labels };
  }

  await refreshCache({ system, service, entityTypeName, authOverride, allowEnvFallback });
  const updated = cacheByKey.get(key);
  return { fields: updated?.fields || [], labels: updated?.labels || {} };
}

// Optional: keep your old exports for compatibility
export async function getAllowedFields(args = {}) {
  const { fields } = await getAllowedFieldsWithLabels(args);
  return fields;
}

export async function getFieldLabels(args = {}) {
  const { labels } = await getAllowedFieldsWithLabels(args);
  return labels || {};
}
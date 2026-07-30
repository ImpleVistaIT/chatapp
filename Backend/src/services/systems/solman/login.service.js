import {
  buildSapLoginRequest,
  normalizeSystemId,
} from "../../../config/sap.config.js";

function cleanString(v) {
  return String(v || "").trim();
}

function escODataString(value) {
  return String(value || "").replace(/'/g, "''");
}

function buildBaseUrl({ protocol = "https", host, port }) {
  const p = cleanString(protocol || "https").toLowerCase() === "http" ? "http" : "https";
  const h = cleanString(host);
  const prt = cleanString(port);

  if (!h) {
    const e = new Error("host is required");
    e.status = 400;
    throw e;
  }

  return `${p}://${h}${prt ? `:${prt}` : ""}`;
}

function buildLegacyLoginUrl(baseUrl, sapUser, sapPassword) {
  const root = String(baseUrl || "").trim().replace(/\/+$/, "");
  const filter = `$filter=UserName eq '${escODataString(sapUser)}' and Password eq '${escODataString(sapPassword)}'`;
  return `${root}/sap/opu/odata/sap/ZNEW_USER_LOGIN_SRV/user_loginSet?${encodeURI(filter)}`;
}

function extractTagValue(xml, tagName) {
  const re = new RegExp(`<d:${tagName}>([\\s\\S]*?)<\\/d:${tagName}>`, "i");
  const m = xml.match(re);
  return cleanString(m?.[1]);
}

function extractJsonField(jsonText, fieldName) {
  try {
    const parsed = JSON.parse(jsonText);
    const candidates = [parsed?.d, parsed?.data, parsed];

    for (const candidate of candidates) {
      if (!candidate || typeof candidate !== "object") continue;
      const value = candidate?.[fieldName];
      if (value != null && String(value).trim()) {
        return cleanString(value);
      }
    }
  } catch {
    // ignore parse failures; the caller will fall back to XML-only checks
  }

  return "";
}

export function normalizeSolmanLoginResponse(xml, requestUrl) {
  const message = extractTagValue(xml, "Message") || extractJsonField(xml, "Message");
  const userName = extractTagValue(xml, "UserName") || extractJsonField(xml, "UserName");
  const normalizedMessage = String(message || "").toLowerCase();
  const errorLike = /error|failed|invalid|unauthorized|forbidden|denied/.test(normalizedMessage);
  const hasPayload = Boolean(String(message || "").trim() || String(userName || "").trim());

  return {
    ok: hasPayload && !errorLike,
    message: message || "Login failed",
    userName,
    raw: xml,
    requestUrl,
  };
}

function buildBasicAuthHeader(username, password) {
  return `Basic ${Buffer.from(`${username}:${password}`, "utf8").toString("base64")}`;
}

function toDebugString(err) {
  const parts = [
    err?.message ? `message=${err.message}` : "",
    err?.code ? `code=${err.code}` : "",
    err?.errno ? `errno=${err.errno}` : "",
    err?.type ? `type=${err.type}` : "",
    err?.name ? `name=${err.name}` : "",
    err?.cause?.message ? `cause.message=${err.cause.message}` : "",
    err?.cause?.code ? `cause.code=${err.cause.code}` : "",
    err?.cause?.errno ? `cause.errno=${err.cause.errno}` : "",
    err?.cause?.name ? `cause.name=${err.cause.name}` : "",
  ].filter(Boolean);

  return parts.join(", ");
}

export async function loginToSolman({
  systemId = null,
  baseUrl,
  protocol = "https",
  host,
  port,
  sapUser,
  sapPassword,
  loginTargets = undefined,
  requireMappedSystem = false,
  fallbackTarget = null,
}) {
  const user = cleanString(sapUser);
  const password = cleanString(sapPassword);
  const normalizedSystemId = normalizeSystemId(systemId);

  const mappedLoginRequest = normalizedSystemId
    ? buildSapLoginRequest({
        systemId: normalizedSystemId,
        sapUser: user,
        sapPassword: password,
        loginTargets,
        requireMappedSystem,
        fallbackTarget,
      })
    : null;

  const root = mappedLoginRequest?.baseUrl || cleanString(baseUrl) || buildBaseUrl({ protocol, host, port });

  if (!root) {
    const e = new Error("baseUrl or host is required");
    e.status = 400;
    throw e;
  }

  if (!user) {
    const e = new Error("sapUser is required");
    e.status = 400;
    throw e;
  }

  if (!password) {
    const e = new Error("sapPassword is required");
    e.status = 400;
    throw e;
  }

  const url = mappedLoginRequest?.requestUrl || buildLegacyLoginUrl(root, user, password);

  console.info("[SolMan login] selected login target", {
    systemId: normalizedSystemId || null,
    source: mappedLoginRequest ? "mapped" : "legacy",
    baseUrl: root,
    serviceName: mappedLoginRequest?.serviceName || "ZNEW_USER_LOGIN_SRV",
    entitySet: mappedLoginRequest?.entitySet || "user_loginSet",
    requestUrl: url,
  });

  let response;
  let text = "";

  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/xml, text/xml, application/atom+xml",
        Authorization: buildBasicAuthHeader(user, password),
        "X-Requested-With": "XMLHttpRequest",
      },
    });

    text = await response.text();
  } catch (err) {
    console.error("[SolMan login] fetch failed", {
      requestUrl: url,
      debug: toDebugString(err),
      cause: err?.cause || null,
    });

    const debug = toDebugString(err);
    const e = new Error(
      debug
        ? `SolMan login request failed: ${debug}`
        : "SolMan login request failed before receiving a response."
    );
    e.status = 502;
    e.requestUrl = url;
    e.responseData = null;
    e.cause = err?.cause || err || null;
    throw e;
  }

  const normalized = normalizeSolmanLoginResponse(text, url);

  if (!response.ok || !normalized.ok) {
    const e = new Error(normalized.message || `SolMan login failed (${response.status})`);
    e.status = response.ok ? 401 : response.status;
    e.responseData = text;
    e.requestUrl = url;
    throw e;
  }

  return normalized;
}
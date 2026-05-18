import axios from "axios";
import https from "node:https";
import { parseStringPromise } from "xml2js";

// -----------------------
// SAP Date Normalization
// -----------------------
function parseSapDate(value) {
  if (typeof value !== "string") return value;

  const match = /\/Date\((\d+)\)\//.exec(value);
  if (match) {
    return new Date(Number(match[1])).toISOString().split("T")[0];
  }

  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(value)) {
    return value.split("T")[0];
  }

  return value;
}

function normalizeSapData(data) {
  if (Array.isArray(data)) return data.map(normalizeSapData);

  if (data && typeof data === "object") {
    const out = {};
    for (const key in data) out[key] = normalizeSapData(data[key]);
    return out;
  }

  return parseSapDate(data);
}

// -----------------------
// HTTPS Agent
// -----------------------
function makeHttpsAgent() {
  const allowInsecure = String(process.env.SAP_ALLOW_INSECURE_TLS || "false").toLowerCase() === "true";
  return new https.Agent({ rejectUnauthorized: !allowInsecure });
}

// -----------------------
// Build SAP URL from DB system + service map
// -----------------------
export function buildSapServiceRoot({ system, service }) {
  const protocol = (system?.protocol || "https").toLowerCase();
  const host = String(system?.host || "").trim();
  const port = String(system?.port || "").trim();
  const serviceName = String(service?.serviceName || "").trim();

  if (!host) throw new Error("SAP system host missing");
  if (!port) throw new Error("SAP system port missing");
  if (!serviceName) throw new Error("SAP serviceName missing");

  return `${protocol}://${host}:${port}/sap/opu/odata/sap/${serviceName}/`;
}

export function buildSapUrl({ system, service, relativePath }) {
  const base = buildSapServiceRoot({ system, service });
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return new URL(relativePath, normalizedBase).toString();
}

// -----------------------
// Debug helpers
// -----------------------
function byteLenUtf8(x) {
  try {
    if (typeof x === "string") return Buffer.byteLength(x, "utf8");
    return Buffer.byteLength(JSON.stringify(x), "utf8");
  } catch {
    return -1;
  }
}

function safePreview(x, max = 300) {
  try {
    const s = typeof x === "string" ? x : JSON.stringify(x);
    return s.length > max ? s.slice(0, max) + "..." : s;
  } catch {
    return "<unpreviewable>";
  }
}

// -----------------------
// XML -> SAP-like JSON
// -----------------------
function extractText(v) {
  if (Array.isArray(v)) return extractText(v[0]);
  if (v && typeof v === "object" && "_" in v) return v._;
  if (typeof v === "string") return v;
  return v;
}

async function parseSapXml(xmlText) {
  const parsed = await parseStringPromise(xmlText, {
    explicitArray: false,
    mergeAttrs: true,
    trim: true,
  });

  const feed = parsed?.feed;
  if (!feed) {
    throw new Error("SAP XML response does not contain feed");
  }

  let entries = feed.entry || [];
  if (!Array.isArray(entries)) entries = [entries];

  const results = entries.map((entry) => {
    const props = entry?.content?.["m:properties"] || {};
    const row = {};

    for (const [key, value] of Object.entries(props)) {
      const cleanKey = key.includes(":") ? key.split(":")[1] : key;
      row[cleanKey] = extractText(value);
    }

    return row;
  });

  return { d: { results } };
}

// -----------------------
// MAIN FUNCTION
// -----------------------
export async function fetchFromSap({ system, service, relativePath }, authOverride) {
  const url = buildSapUrl({ system, service, relativePath });

  const username = authOverride?.username;
  const password = authOverride?.password;

  if (!username || !password) {
    throw new Error("SAP credentials missing (authOverride required)");
  }

  try {
    const res = await axios.get(url, {
      httpsAgent: makeHttpsAgent(),
      headers: {
        Accept: "application/json, application/atom+xml, application/xml, text/xml",
      },
      auth: { username, password },
      timeout: 30000,
      validateStatus: () => true,
      responseType: "text",
      transformResponse: [(data) => data],
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });

    console.log("👉 SAP URL:", url);
    console.log("👉 SAP STATUS:", res.status);
    console.log("👉 SAP RAW BYTES:", byteLenUtf8(res.data));
    console.log("👉 SAP RAW PREVIEW:", safePreview(res.data, 200));

    if (res.status < 200 || res.status >= 300) {
      throw new Error(`SAP GET failed (${res.status}): ${String(res.data).slice(0, 800)}`);
    }

    let parsed;
    const body = String(res.data || "").trim();
    const contentType = String(res.headers?.["content-type"] || "").toLowerCase();

    if (contentType.includes("json") || body.startsWith("{") || body.startsWith("[")) {
      parsed = JSON.parse(body);
    } else if (
      contentType.includes("xml") ||
      body.startsWith("<feed") ||
      body.startsWith("<?xml") ||
      body.startsWith("<")
    ) {
      parsed = await parseSapXml(body);
    } else {
      throw new Error(`SAP returned unsupported response format: ${body.slice(0, 800)}`);
    }

    const normalized = normalizeSapData(parsed);
    console.log("👉 SAP NORMALIZED BYTES:", byteLenUtf8(normalized));
    console.log("👉 FINAL RETURN ROWS:", normalized?.d?.results?.length || 0);

    return normalized;
  } catch (err) {
    console.log("❌ SAP CALL FAILED:", err.message);
    throw err;
  }
}
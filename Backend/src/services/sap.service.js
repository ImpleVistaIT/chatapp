import axios from "axios";
import https from "node:https";

// -----------------------
// SAP Date Normalization
// -----------------------
function parseSapDate(value) {
  if (typeof value !== "string") return value;

  const match = /\/Date\((\d+)\)\//.exec(value);
  if (!match) return value;

  return new Date(Number(match[1])).toISOString().split("T")[0];
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
      headers: { Accept: "application/json" },
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
    try {
      parsed = JSON.parse(res.data);
    } catch {
      throw new Error(`SAP returned non-JSON response: ${String(res.data).slice(0, 800)}`);
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
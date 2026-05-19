import axios from "axios";
import https from "https";

function joinUrl(base, relativePath) {
  const b = String(base || "").replace(/\/+$/, "");
  const r = String(relativePath || "").replace(/^\/+/, "");
  return `${b}/${r}`;
}

function buildBasicAuthHeader(username, password) {
  const token = Buffer.from(`${username}:${password}`).toString("base64");
  return `Basic ${token}`;
}

function getSapBaseUrl(system) {
  if (system?.baseUrl) return String(system.baseUrl).replace(/\/+$/, "");
  if (system?.url) return String(system.url).replace(/\/+$/, "");
  if (system?.host) {
    const protocol = system?.protocol || "https";
    const port = system?.port ? `:${system.port}` : "";
    return `${protocol}://${system.host}${port}`;
  }
  throw new Error("SAP system base URL not found");
}

function buildAuthHeaders(sapAuth) {
  if (sapAuth?.headers && typeof sapAuth.headers === "object") {
    return { ...sapAuth.headers };
  }

  if (sapAuth?.username && sapAuth?.password) {
    return {
      Authorization: buildBasicAuthHeader(sapAuth.username, sapAuth.password),
    };
  }

  throw new Error("SAP authentication details not found");
}

function buildHttpsAgent(system) {
  const envAllowInsecure =
    String(process.env.SAP_ALLOW_INSECURE_TLS || "").toLowerCase() === "true";

  const allowInsecure =
    system?.allowInsecureTls === true ||
    system?.rejectUnauthorized === false ||
    envAllowInsecure;

  return new https.Agent({
    rejectUnauthorized: !allowInsecure,
  });
}

function extractCookies(setCookieHeader) {
  if (!Array.isArray(setCookieHeader)) return "";
  return setCookieHeader.map((c) => String(c).split(";")[0]).join("; ");
}

function getServiceRootPath(relativePath) {
  const path = `/${String(relativePath || "").replace(/^\/+/, "")}`;
  const marker = "/sap/opu/odata/sap/";
  const idx = path.toLowerCase().indexOf(marker);

  if (idx === -1) return path;

  const afterMarker = path.slice(idx + marker.length);
  const parts = afterMarker.split("/").filter(Boolean);

  if (parts.length === 0) return path;

  return `${path.slice(0, idx + marker.length)}${parts[0]}/`;
}

export async function fetchCsrfToken({ system, relativePath }, sapAuth) {
  const baseUrl = getSapBaseUrl(system);
  const csrfPath = getServiceRootPath(relativePath);
  const url = joinUrl(baseUrl, csrfPath);
  const authHeaders = buildAuthHeaders(sapAuth);

  const res = await axios.get(url, {
    httpsAgent: buildHttpsAgent(system),
    headers: {
      ...authHeaders,
      Accept: "application/json",
      "x-csrf-token": "Fetch",
    },
    validateStatus: () => true,
  });

  if (res.status >= 400) {
    const err = new Error(
      res?.data?.error?.message?.value ||
        `Failed to fetch CSRF token. HTTP ${res.status}`
    );
    err.status = res.status;
    err.responseData = res.data;
    err.responseHeaders = res.headers;
    err.csrfUrl = url;
    throw err;
  }

  const token =
    res.headers["x-csrf-token"] || res.headers["X-CSRF-Token"] || "";
  const cookie = extractCookies(res.headers["set-cookie"]);

  return { token, cookie };
}

export async function postToSap({ system, relativePath, body }, sapAuth) {
  const baseUrl = getSapBaseUrl(system);
  const url = joinUrl(baseUrl, relativePath);
  const authHeaders = buildAuthHeaders(sapAuth);

  const { token, cookie } = await fetchCsrfToken({ system, relativePath }, sapAuth);

  const res = await axios.post(url, body, {
    httpsAgent: buildHttpsAgent(system),
    headers: {
      ...authHeaders,
      Accept: "application/json",
      "Content-Type": "application/json",
      ...(token ? { "x-csrf-token": token } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
    },
    validateStatus: () => true,
  });

  if (res.status >= 400) {
    const err = new Error(
      res?.data?.error?.message?.value || `SAP POST failed. HTTP ${res.status}`
    );
    err.status = res.status;
    err.responseData = res.data;
    err.responseHeaders = res.headers;
    err.postUrl = url;
    throw err;
  }

  return res.data;
}
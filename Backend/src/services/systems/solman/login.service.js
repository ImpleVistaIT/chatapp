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

function buildLoginUrl(baseUrl, sapUser, sapPassword) {
  const root = String(baseUrl || "").trim().replace(/\/+$/, "");
  const filter = `$filter=UserName eq '${escODataString(sapUser)}' and Password eq '${escODataString(sapPassword)}'`;
  return `${root}/sap/opu/odata/sap/ZNEW_USER_LOGIN_SRV/user_loginSet?${encodeURI(filter)}`;
}

function extractTagValue(xml, tagName) {
  const re = new RegExp(`<d:${tagName}>([\\s\\S]*?)<\\/d:${tagName}>`, "i");
  const m = xml.match(re);
  return cleanString(m?.[1]);
}

export function normalizeSolmanLoginResponse(xml, requestUrl) {
  const message = extractTagValue(xml, "Message");
  const userName = extractTagValue(xml, "UserName");

  return {
    ok: /login successful/i.test(message),
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
  baseUrl,
  protocol = "https",
  host,
  port,
  sapUser,
  sapPassword,
}) {
  const user = cleanString(sapUser);
  const password = cleanString(sapPassword);

  const root = cleanString(baseUrl) || buildBaseUrl({ protocol, host, port });

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

  const url = buildLoginUrl(root, user, password);

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

  if (!response.ok) {
    const e = new Error(`SolMan login failed (${response.status})`);
    e.status = response.status;
    e.responseData = text;
    e.requestUrl = url;
    throw e;
  }

  return normalizeSolmanLoginResponse(text, url);
}
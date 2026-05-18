function cleanString(v) {
  return String(v || "").trim();
}

function escODataString(value) {
  return String(value || "").replace(/'/g, "''");
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

export async function loginToSolman({ baseUrl, sapUser, sapPassword }) {
  const user = cleanString(sapUser);
  const password = cleanString(sapPassword);
  const root = cleanString(baseUrl);

  if (!root) {
    const e = new Error("baseUrl is required");
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

  const response = await fetch(url, {
    method: "GET",
    headers: {
      Accept: "application/xml, text/xml, application/atom+xml",
      Authorization: buildBasicAuthHeader(user, password),
      "X-Requested-With": "XMLHttpRequest",
    },
  });

  const text = await response.text();

  if (!response.ok) {
    const e = new Error(`SolMan login failed (${response.status})`);
    e.status = response.status;
    e.responseData = text;
    throw e;
  }

  return normalizeSolmanLoginResponse(text, url);
}
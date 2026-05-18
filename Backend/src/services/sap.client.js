import axios from "axios";
import https from "node:https";
import { ApiError } from "../utils/errors.js";

function buildUrl(path) {
  const base = process.env.SAP_BASE_URL;
  if (!base) throw new ApiError(500, "SAP_BASE_URL is not configured.");
  return `${base}${path.startsWith("/") ? "" : "/"}${path}`;
}

function basicAuthHeader() {
  const u = process.env.SAP_USERNAME || "";
  const p = process.env.SAP_PASSWORD || "";
  if (!u || !p) throw new ApiError(500, "SAP_USERNAME / SAP_PASSWORD not configured.");
  const token = Buffer.from(`${u}:${p}`).toString("base64");
  return `Basic ${token}`;
}

function getHttpsAgent() {
  const allowInsecure =
    String(process.env.SAP_ALLOW_INSECURE_TLS || "false").toLowerCase() === "true";
  return new https.Agent({ rejectUnauthorized: !allowInsecure });
}

export async function sapGetJson(pathWithQuery) {
  const url = buildUrl(pathWithQuery);

  try {
    const resp = await axios.get(url, {
      httpsAgent: getHttpsAgent(),
      headers: {
        Authorization: basicAuthHeader(),
        Accept: "application/json",
      },
      timeout: 30000,
      validateStatus: () => true,
    });

    if (resp.status < 200 || resp.status >= 300) {
      throw new ApiError(resp.status, `SAP GET failed (${resp.status})`, {
        url,
        body: JSON.stringify(resp.data).slice(0, 1200),
      });
    }

    // SAP Gateway OData often returns: { d: { results: [...] } } (v2)
    return resp.data;
  } catch (err) {
    throw new ApiError(502, "fetch failed", {
      url,
      code: err?.code,
      message: err?.message,
    });
  }
}
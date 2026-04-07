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

export async function sapGetXml(pathWithQuery) {
  const url = buildUrl(pathWithQuery);

  const allowInsecure = String(process.env.SAP_ALLOW_INSECURE_TLS || "false").toLowerCase() === "true";
  const httpsAgent = new https.Agent({ rejectUnauthorized: !allowInsecure });

  try {
    const resp = await axios.get(url, {
      responseType: "text",
      httpsAgent,
      headers: {
        Authorization: basicAuthHeader(),
        Accept: "application/atom+xml,application/xml,text/xml",
      },
      // Optional but useful
      timeout: 30000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: () => true,
    });

    if (resp.status < 200 || resp.status >= 300) {
      throw new ApiError(resp.status, `SAP GET failed (${resp.status})`, {
        url,
        body: String(resp.data || "").slice(0, 1200),
      });
    }

    return String(resp.data || "");
  } catch (err) {
    // Network / DNS / TLS errors land here
    throw new ApiError(502, "fetch failed", {
      url,
      code: err?.code,
      message: err?.message,
    });
  }
}
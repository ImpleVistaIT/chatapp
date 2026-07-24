import { postToSap } from "../../sap/sapWrite.service.js";

const SAP_BASE_URL = "https://192.168.1.219:50101";
const SAP_ENDPOINT = "/sap/opu/odata/sap/ZTR_PROD_IMPORT_SRV/ImportTransportSet";

function cleanString(value) {
  return String(value ?? "").trim();
}

function parseMessages(value) {
  if (!value) return [];

  const input = Array.isArray(value) ? value : typeof value === "string" ? value.trim() : value;
  let parsed = input;

  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      parsed = input.split(/\r?\n+/).map((line) => ({ MSG_DESC: cleanString(line) })).filter((item) => item.MSG_DESC);
    }
  }

  const rows = Array.isArray(parsed) ? parsed : parsed?.results || parsed?.d?.results || [];

  return rows
    .map((item) => cleanString(item?.MSG_DESC || item?.MsgDesc || item?.MESSAGE || item?.message || item?.TEXT || item?.Text || item?.DESCRIPTION || item?.Description))
    .filter(Boolean);
}

export function isImportTransportToProductionIntent(query = "") {
  const q = cleanString(query).toLowerCase();
  if (!q) return false;

  return (
    /\bimport\s+(?:transport\s+request|transport\s+number|transport\s+id|transport|tr)\b/i.test(q) ||
    /\b(?:transport|tr)\s+import\b/i.test(q) ||
    /\b(?:production\s+import|import\s+to\s+production|move\s+(?:transport|tr)\s+to\s+production|deploy\s+transport\s+to\s+production|send\s+transport\s+to\s+production)\b/i.test(q)
  );
}

export function buildImportTransportToProductionPayload({ transportNumber, sapUser, systemId } = {}) {
  return {
    ObjectId: cleanString(transportNumber).toUpperCase(),
  };
}

export async function importTransportToProduction({ system, sapAuth, payload }) {
  const body = buildImportTransportToProductionPayload(payload);

  if (!body.ObjectId) {
    return {
      ok: false,
      message: "Transport number is required.",
      endpoint: SAP_ENDPOINT,
      requestBody: body,
    };
  }

  const raw = await postToSap({
    system: {
      ...system,
      baseUrl: SAP_BASE_URL,
    },
    relativePath: SAP_ENDPOINT,
    body,
  }, sapAuth);

  const data = raw?.d || raw?.data?.d || raw?.body?.d || raw || {};
  const objectId = cleanString(data?.ObjectId || data?.OBJECT_ID || data?.objectId || body.ObjectId);
  const success = cleanString(data?.Success || data?.SUCCESS || "").toUpperCase();
  const outputMessage = cleanString(data?.TrOutputMsg || data?.TrOutputMSG || data?.Message || data?.MESSAGE || "");
  const messages = parseMessages(data?.Messages || data?.MESSAGES);

  const detailLines = [];
  if (outputMessage) detailLines.push(outputMessage);
  if (objectId) detailLines.push(`Object Id : ${objectId}`);
  if (success) detailLines.push(`Success   : ${success}`);
  if (messages.length > 0) {
    detailLines.push("", "Messages", ...messages.map((message) => `• ${message}`));
  }

  return {
    ok: true,
    message: detailLines.length > 0 ? detailLines.join("\n") : "Transport imported to production.",
    status: success,
    objectId,
    outputMessage,
    messages,
    raw: {
      ObjectId: objectId,
      Success: success,
      TrOutputMsg: outputMessage,
      Messages: messages,
    },
  };
}

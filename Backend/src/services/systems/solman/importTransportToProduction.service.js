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
    TransportNumber: cleanString(transportNumber).toUpperCase(),
    SapUser: cleanString(sapUser),
    SystemId: cleanString(systemId),
  };
}

export async function importTransportToProduction({ system, sapAuth, payload }) {
  const body = buildImportTransportToProductionPayload(payload);

  if (!body.TransportNumber) {
    return {
      ok: false,
      message: "Transport number is required.",
      endpoint: SAP_ENDPOINT,
      requestBody: body,
    };
  }

  if (!system?.callSapApi) {
    return {
      ok: false,
      message: "SAP client is not available for production import transport.",
      endpoint: SAP_ENDPOINT,
      requestBody: body,
    };
  }

  const result = await system.callSapApi({
    method: "POST",
    path: SAP_ENDPOINT,
    sapAuth,
    data: body,
  });

  const data = result?.d || result?.data?.d || result?.body?.d || result || {};
  const objectId = cleanString(data?.ObjectId || data?.OBJECT_ID || data?.objectId || body.TransportNumber);
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
    ok: Boolean(result?.ok),
    message: detailLines.length > 0 ? detailLines.join("\n") : (result?.message || (result?.ok ? "Transport imported to production." : "Failed to import transport to production.")),
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

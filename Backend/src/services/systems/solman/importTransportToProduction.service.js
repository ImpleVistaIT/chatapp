const SAP_ENDPOINT = "/sap/opu/odata/sap/ZTR_PROD_IMPORT_SRV/ImportTransportSet";

function cleanString(value) {
  return String(value ?? "").trim();
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

  return {
    ok: Boolean(result?.ok),
    message: result?.message || (result?.ok ? "Transport imported to production." : "Failed to import transport to production."),
    endpoint: SAP_ENDPOINT,
    requestBody: body,
    result,
  };
}

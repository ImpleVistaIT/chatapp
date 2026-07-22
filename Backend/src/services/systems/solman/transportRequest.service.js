import { postToSap } from "../../sap/sapWrite.service.js";

const SAP_ENDPOINT = "/sap/opu/odata/sap/ZTR_CREATION_SRV/TR_CreateSet";

function cleanString(value = "") {
  return String(value || "").trim();
}

function cleanOutputValue(value = "") {
  if (typeof value === "boolean") return "";
  const normalized = cleanString(value);
  return normalized === "true" || normalized === "false" ? "" : normalized;
}

function parseMessages(value) {
  if (!value) return [];

  const rawValue = Array.isArray(value) ? value : typeof value === "string" ? value.trim() : value;
  let parsed = rawValue;

  if (typeof rawValue === "string") {
    try {
      parsed = JSON.parse(rawValue);
    } catch {
      parsed = rawValue.split(/\r?\n+/).map((line) => ({ MSG_DESC: cleanString(line) })).filter((item) => item.MSG_DESC);
    }
  }

  const messages = Array.isArray(parsed) ? parsed : parsed?.results || parsed?.d?.results || [];

  return messages
    .map((item) => cleanString(item?.MSG_DESC || item?.MsgDesc || item?.MESSAGE || item?.message || item?.TEXT || item?.Text || item?.DESCRIPTION || item?.Description))
    .filter(Boolean);
}

function normalizeDeveloperSet(developers = []) {
  return (Array.isArray(developers) ? developers : [])
    .map((developer) =>
      cleanString(
        typeof developer === "object" && developer !== null
          ? developer.Developer ?? developer.developer ?? developer.value ?? ""
          : developer
      )
    )
    .filter(Boolean)
    .map((Developer) => ({ Developer }));
}

function normalizeResponseData(raw = {}) {
  const data = raw?.d || raw?.data?.d || raw?.body?.d || raw || {};
  const messages = parseMessages(
    data?.Messages || data?.MESSAGES || data?.Messages?.results || raw?.Messages || raw?.MESSAGES || data?.EV_MESSAGES || data?.EV_MESSAGE
  );

  return {
    raw: data,
    changeRequestId: cleanOutputValue(data?.CrNumber || data?.CRNumber || data?.ChangeRequestId || data?.ChangeRequest || data?.RequestId || data?.RequestID || ""),
    trOwner: cleanOutputValue(data?.TrOwner || data?.TR_OWNER || data?.TransportOwner || data?.Owner || ""),
    client: cleanOutputValue(data?.Client || data?.CLIENT || data?.Mandt || ""),
    transportRequest: cleanOutputValue(data?.TrNumber || data?.TRNumber || data?.TransportRequest || data?.TransportNo || data?.RequestNo || ""),
    workbenchTransport: cleanOutputValue(raw?.EV_WORKBENCH_TR || data?.EV_WORKBENCH_TR || data?.WorkbenchTR || data?.WorkbenchReq || data?.WorkbenchTransport || ""),
    customizingTransport: cleanOutputValue(raw?.EV_CUSTOMIZING_TR || data?.EV_CUSTOMIZING_TR || data?.CustomizingTR || data?.CustomizingReq || data?.CustomizingTransport || ""),
    message: cleanOutputValue(data?.Message || data?.MESSAGE || data?.EV_MESSAGE || data?.EV_TR_OUTPUT_MSG || data?.StatusText || data?.STATUS_TEXT || ""),
    outputMessage: cleanOutputValue(data?.EV_TR_OUTPUT_MSG || data?.EV_OUTPUT_MSG || data?.OutputMessage || data?.OUTPUT_MESSAGE || data?.Message || data?.MESSAGE || ""),
    messages,
    warning: cleanOutputValue(data?.Warning || data?.WARNING || data?.EV_WARNING || ""),
    status: cleanOutputValue(data?.Status || data?.STATUS || data?.EV_STATUS || data?.MsgType || data?.MSG_TYPE || ""),
  };
}

function buildRequestBody(payload = {}) {
  return {
    SolmanChangeReq: cleanString(payload.SolmanChangeReq),
    TrOwner: cleanString(payload.TrOwner),
    WorkbenchReq: Boolean(payload.WorkbenchReq),
    CustomizingReq: Boolean(payload.CustomizingReq),
    Client: cleanString(payload.Client),
    DeveloperSet: normalizeDeveloperSet(payload.DeveloperSet),
  };
}

function buildErrorMessage(error) {
  const sapMessage = cleanString(error?.responseData?.error?.message?.value);
  if (sapMessage) return sapMessage;

  const rawText = cleanString(error?.message);
  if (rawText) return rawText;

  return "Unable to create Transport Request.";
}

export async function createTransportRequest({ system, sapAuth, payload }) {
  const body = buildRequestBody(payload);

  try {
    const raw = await postToSap(
      {
        system,
        relativePath: SAP_ENDPOINT,
        body,
      },
      sapAuth
    );

    const result = normalizeResponseData(raw);

    const replyMessage = [
      result.message || result.warning || "Transport created successfully.",
      result.changeRequestId ? `CR Number: ${result.changeRequestId}` : null,
      result.transportRequest ? `TR Number: ${result.transportRequest}` : null,
      result.workbenchTransport ? `Workbench TR: ${result.workbenchTransport}` : null,
      result.customizingTransport ? `Customizing TR: ${result.customizingTransport}` : null,
    ].filter(Boolean).join("\n");

    return {
      ok: true,
      message: replyMessage,
      result,
      requestBody: body,
    };
  } catch (error) {
    const friendlyMessage = buildErrorMessage(error);

    return {
      ok: false,
      message: friendlyMessage,
      error: {
        message: friendlyMessage,
        status: error?.status || null,
        code: error?.code || null,
        raw: error?.responseData || null,
      },
      requestBody: body,
    };
  }
}
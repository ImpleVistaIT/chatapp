import { postToSap } from "../../sap/sapWrite.service.js";

const SAP_ENDPOINT = "/sap/opu/odata/sap/ZTR_CREATION_SRV/TR_CreateSet";

function cleanString(value = "") {
  return String(value || "").trim();
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

  return {
    raw: data,
    transportRequest: cleanString(data?.TrNumber || data?.TRNumber || data?.TransportRequest || data?.TransportNo || data?.RequestNo || ""),
    workbenchTransport: cleanString(data?.WorkbenchTR || data?.WorkbenchReq || data?.WorkbenchTransport || ""),
    customizingTransport: cleanString(data?.CustomizingTR || data?.CustomizingReq || data?.CustomizingTransport || ""),
    message: cleanString(data?.Message || data?.MESSAGE || data?.EV_MESSAGE || data?.StatusText || data?.STATUS_TEXT || ""),
    warning: cleanString(data?.Warning || data?.WARNING || data?.EV_WARNING || ""),
    status: cleanString(data?.Status || data?.STATUS || data?.EV_STATUS || data?.MsgType || data?.MSG_TYPE || ""),
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

    return {
      ok: true,
      message: result.warning || result.message || "Transport created successfully.",
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
import { postToSap } from "../../sap/sapWrite.service.js";

const SAP_ENDPOINT = "/sap/opu/odata/sap/ZTR_RELEASE_SRV/TR_ReleaseSet";

function cleanString(value = "") {
  return String(value || "").trim();
}

function normalizeResponseData(raw = {}) {
  const data = raw?.d || raw?.data?.d || raw?.body?.d || raw || {};

  return {
    raw: data,
    success: cleanString(data?.EvSuccess || data?.EV_SUCCESS || data?.Success || data?.SUCCESS || ""),
    message: cleanString(
      data?.EvTrOutputMsg ||
        data?.EV_TR_OUTPUT_MSG ||
        data?.Message ||
        data?.MESSAGE ||
        data?.StatusText ||
        data?.STATUS_TEXT ||
        ""
    ),
  };
}

function buildRequestBody(payload = {}) {
  return {
    IvObjectId: cleanString(payload.IvObjectId || payload.transportNumber || payload.transportNumberId || "").toUpperCase(),
    IvQuality: Boolean(payload.IvQuality),
  };
}

function buildErrorMessage(error) {
  const sapMessage = cleanString(error?.responseData?.error?.message?.value);
  if (sapMessage) return sapMessage;

  const rawText = cleanString(error?.message);
  if (rawText) return rawText;

  return "Transport release failed.";
}

export async function releaseTransportRequest({ system, sapAuth, payload }) {
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
    const success = String(result.success || "").trim().toLowerCase();

    return {
      ok: success === "x" || success === "true" || success === "1" || success === "s" || success === "success" || Boolean(result.message),
      message: result.message || "Transport released successfully.",
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

import { postToSap } from "../../sap/sapWrite.service.js";

const SAP_ENDPOINT = "/sap/opu/odata/sap/ZTR_RELEASE_SRV/TR_ReleaseSet";

function cleanString(value = "") {
  return String(value || "").trim();
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

function normalizeResponseData(raw = {}) {
  const data = raw?.d || raw?.data?.d || raw?.body?.d || raw || {};
  const status = cleanString(
    data?.EvSuccess ||
      data?.EV_SUCCESS ||
      data?.Status ||
      data?.STATUS ||
      data?.MsgType ||
      data?.MSG_TYPE ||
      data?.EvMsgType ||
      data?.EV_MSG_TYPE ||
      ""
  ).toUpperCase();
  const messageText = cleanString(
    data?.EvTrOutputMsg ||
      data?.EV_TR_OUTPUT_MSG ||
      data?.Message ||
      data?.MESSAGE ||
      data?.StatusText ||
      data?.STATUS_TEXT ||
      ""
  );
  const messages = parseMessages(data?.MESSAGES || data?.Messages || data?.messages || raw?.MESSAGES || raw?.Messages);

  const detailLines = [];
  if (messageText) detailLines.push(messageText);
  if (messages.length > 0) detailLines.push(...messages);

  return {
    raw: data,
    status,
    message: messageText,
    messages,
    details: detailLines,
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
    const status = String(result.status || "").trim().toUpperCase();
    const isSuccess = ["S", "X", "SUCCESS"].includes(status);
    const isWarning = ["W", "WARNING"].includes(status);
    const isError = ["E", "ERROR"].includes(status);
    const detailLines = Array.isArray(result.details) ? result.details : [];
    const message = detailLines.length > 0
      ? detailLines.join("\n")
      : result.message || (isSuccess ? "Transport released successfully." : isWarning ? "Transport released with warning." : "Transport release failed.");

    return {
      ok: isSuccess || isWarning || (!isError && Boolean(message)),
      warning: isWarning,
      errorStatus: isError,
      message,
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

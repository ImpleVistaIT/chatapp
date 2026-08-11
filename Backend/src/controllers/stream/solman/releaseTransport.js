import { releaseTransportRequest } from "../../../services/systems/solman/transportRelease.service.js";
import { cleanString, persistAssistantAndTouchSession } from "./solman.shared.js";
import { step } from "../stream.shared.js";

const INTENT = "release_transport_request";
const FORM_ID = "solman_release_transport";

function normalizeBoolean(value) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value === 1;
  const text = cleanString(value).toLowerCase();
  if (["true", "x", "1", "yes", "y"].includes(text)) return true;
  if (["false", "0", "no", "n", ""].includes(text)) return false;
  return null;
}

function pickTransportReleaseEntities(raw = {}, query = "") {
  const q = String(query || "");
  const transportNumber = cleanString(
    raw.transportNumber ||
      raw.transportNo ||
      raw.objectId ||
      raw.OBJECT_ID ||
      raw.IvObjectId ||
      q.match(/\b([A-Z]{2,6}\d{4,10})\b/i)?.[1] ||
      ""
  ).toUpperCase();

  const quality = normalizeBoolean(raw.quality ?? raw.IvQuality ?? raw.releaseToQuality);

  return {
    transportNumber,
    quality,
  };
}

function getMissingFields(payload = {}) {
  const missing = [];
  if (!cleanString(payload.transportNumber)) missing.push("transportNumber");
  if (payload.quality === null || typeof payload.quality === "undefined") missing.push("quality");
  return missing;
}

function buildFormResponse(prefilledData, missingFields) {
  return {
    intent: INTENT,
    action: {
      type: "open_form",
      formId: FORM_ID,
    },
    formId: FORM_ID,
    prefilledData,
    missingFields,
  };
}

function buildSuccessReply({ transportNumber }) {
  return `Transport ${transportNumber} released successfully.`;
}

function buildErrorReply(errorMessage = "") {
  return ["Transport release failed.", errorMessage ? `Reason: ${errorMessage}` : null].filter(Boolean).join("\n");
}

export function isReleaseTransportIntent(query = "") {
  const q = cleanString(query).toLowerCase();
  if (!q) return false;

  if (/\brelease\s+task\b/i.test(q)) return false;
  if (/\bcreate\s+transport\b/i.test(q)) return false;
  if (/\bcreate\s+cr\b/i.test(q)) return false;

  return (
    /\brelease\b[\s\S]{0,40}\b(?:transport request|transport|tr)\b/i.test(q) ||
    /\b(?:transport request|transport|tr)\b[\s\S]{0,40}\brelease\b/i.test(q) ||
    /\brelease\s+tr\b/i.test(q) ||
    /\brelase\s+tr\b/i.test(q) ||
    /\brelase\s+transport\b/i.test(q)
  );
}

export async function handleReleaseTransport(context) {
  const { sse, owner, query, session, system, sapAuth, effectiveSystemId, effectiveSapUser, classified } = context;

  console.log("[ReleaseTransport] Intent detected");

  const collected = pickTransportReleaseEntities(classified?.entities || {}, query);
  const missingFields = getMissingFields(collected);
  const formResponse = buildFormResponse(collected, missingFields);

  const message = collected.transportNumber
    ? `Please confirm release for transport request ${collected.transportNumber}.`
    : "Please enter the transport request number to release.";

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: message,
    summary: collected.transportNumber
      ? `Asked user to confirm release for transport ${collected.transportNumber}.`
      : "Asked user to provide the transport request number for release.",
    extracted: {
      system: "solman",
      intent: INTENT,
      pending: true,
      payload: collected,
      missingFields,
    },
    data: formResponse,
    responseMeta: {
      ok: false,
      kind: "stream",
      executor: "solman.transport.releaseTransport",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      status: "needs_input",
    },
  });

  sse.send("error", {
    ok: false,
    sessionId: String(session._id),
    status: "needs_input",
    message,
    action: {
      type: "open_form",
      formId: FORM_ID,
    },
    pendingAction: {
      collected,
      missingFields,
    },
    missingFields,
  });
  return sse.end();
}

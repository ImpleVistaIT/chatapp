import { createTransportRequest } from "../../../services/systems/solman/transportRequest.service.js";
import { step } from "../stream.shared.js";
import { cleanString, persistAssistantAndTouchSession } from "./solman.shared.js";
import { buildTransportRequestPayload, pickCreateTransportRequestEntities } from "./transport-request.parser.js";
import { getMissingCreateTransportRequestFields } from "./transport-request.validator.js";

const INTENT = "create_transport_request";
const FORM_ID = "solman_create_transport_request";

function uniqueDeveloperObjects(values = []) {
  const seen = new Set();
  const out = [];

  for (const item of Array.isArray(values) ? values : []) {
    const developer = cleanString(item?.Developer || item?.developer).toUpperCase();
    if (!developer || seen.has(developer)) continue;
    seen.add(developer);
    out.push({ Developer: developer });
  }

  return out;
}

function buildMissingFieldsMessage(missingFields = []) {
  const labels = {
    SolmanChangeReq: "Change Request Number",
    TrOwner: "Transport Owner",
    Client: "Client",
    WorkbenchReq: "(Yes/No)",
    CustomizingReq: "Customizing Request (Yes/No)",
    DeveloperSet: "Developers",
    TransportType: "Workbench or Customizing selection",
  };

  const lines = ["Please complete the required Transport Request details:", ""];

//   for (const field of missingFields) {
//     if (labels[field]) lines.push(`• ${labels[field]}`);
//   }

  return lines.join("\n");
}

function buildSuccessReply(result = {}) {
  const messages = Array.isArray(result.messages) ? result.messages.map((message) => cleanString(message)).filter(Boolean) : [];
  const status = cleanString(result.status).toUpperCase();
  const headline = cleanString(result.outputMessage) || cleanString(result.message) || (status === "W" ? "Transport Request created with warning." : "Transport Request created successfully.");
  const lines = [headline];

  if (cleanString(result.changeRequestId)) lines.push(`Change Request Number : ${cleanString(result.changeRequestId)}`);
  if (cleanString(result.trOwner)) lines.push(`Transport Owner       : ${cleanString(result.trOwner)}`);
  if (cleanString(result.client)) lines.push(`Client                : ${cleanString(result.client)}`);
  if (cleanString(result.workbenchTransport)) lines.push(`Workbench Request     : ${cleanString(result.workbenchTransport)}`);
  if (cleanString(result.customizingTransport)) lines.push(`Customizing Request   : ${cleanString(result.customizingTransport)}`);
  if (status === "W") lines.push("Status                : Warning");

  if (messages.length > 0) {
    lines.push("", "Messages", ...messages.map((message) => `• ${message}`));
  }

  return lines.join("\n");
}

function isSapErrorStatus(status = "") {
  return cleanString(status).toUpperCase().startsWith("E");
}

function buildErrorReply(errorMessage = "") {
  return ["Unable to create Transport Request.", errorMessage ? `Reason: ${errorMessage}` : null]
    .filter(Boolean)
    .join("\n");
}

export function isCreateTransportRequestIntent(query = "") {
  const q = cleanString(query).toLowerCase();
  if (!q) return false;

  if (/\btransport\s+task\b/i.test(q)) return false;

  return /\b(?:create|generate|raise|make|open)\b[\s\S]{0,40}\b(?:transport request|\btr\b)\b/i.test(q) ||
    /\b(?:transport request|\btr\b)\b[\s\S]{0,40}\b(?:create|generate|raise|make|open)\b/i.test(q) ||
    /\bcreate\s+transport\s+request\b/i.test(q) ||
    /\bgenerate\s+tr\b/i.test(q);
}

export async function handleCreateTransportRequest(context) {
  const { sse, owner, query, session, system, sapAuth, effectiveSystemId, effectiveSapUser, classified } = context;

  console.log("[CreateTR] Intent detected");

  const collected = pickCreateTransportRequestEntities(classified?.entities || {}, query);
  collected.DeveloperSetObjects = uniqueDeveloperObjects(collected.DeveloperSetObjects || collected.DeveloperSet?.map((Developer) => ({ Developer })));
  collected.DeveloperSet = collected.DeveloperSetObjects.map((item) => item.Developer);

  const missingFields = getMissingCreateTransportRequestFields(buildTransportRequestPayload(collected));

  if (missingFields.length > 0) {
    const message = buildMissingFieldsMessage(missingFields);

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user to complete required transport request details.",
      extracted: {
        system: "solman",
        intent: INTENT,
        pending: true,
        payload: collected,
        missingFields,
      },
      data: {
        action: {
          type: "open_form",
          formId: FORM_ID,
        },
        pendingAction: {
          collected,
          missingFields,
        },
        missingFields,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport.createTransportRequest",
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

  sse.send("phase", {
    phase: "executing",
    message: "Creating transport request in Solution Manager...",
  });

  const result = await step("createTransportRequest", () =>
    createTransportRequest({
      system,
      sapAuth,
      payload: buildTransportRequestPayload(collected),
    })
  );

  if (isSapErrorStatus(result?.result?.status)) {
    const errorMessage = cleanString(result?.result?.outputMessage || result?.result?.message || result?.message || "Error occurred while creating Transport Request.");
    const reply = buildErrorReply(errorMessage);

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: reply,
      summary: reply,
      extracted: {
        system: "solman",
        intent: INTENT,
        payload: collected,
      },
      data: {
        ...result.result,
        trOwner: collected.TrOwner,
        client: collected.Client,
        requestBody: result.requestBody,
        viewType: "solman_create_transport_request_error",
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport.createTransportRequest",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "execution_failed",
      },
    });

    sse.send("error", {
      ok: false,
      status: "execution_failed",
      message: reply,
      data: {
        ...result.result,
        trOwner: collected.TrOwner,
        client: collected.Client,
        requestBody: result.requestBody,
        viewType: "solman_create_transport_request_error",
      },
    });
    return sse.end();
  }

  if (!result?.ok) {
    const message = buildErrorReply(result?.message || "Failed to create Transport Request.");

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Transport request creation failed.",
      extracted: {
        system: "solman",
        intent: INTENT,
        payload: collected,
      },
      data: {
        sap: result?.error || null,
        raw: result?.result?.raw || null,
        requestBody: result?.requestBody || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport.createTransportRequest",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "execution_failed",
      },
    });

    sse.send("error", {
      ok: false,
      status: "execution_failed",
      message,
      sap: result?.error || null,
      raw: result?.result?.raw || null,
    });
    return sse.end();
  }

  const reply = buildSuccessReply(result.result);
  const persistedData = {
    ...result.result,
    trOwner: collected.TrOwner,
    client: collected.Client,
    messages: Array.isArray(result.result.messages) ? result.result.messages : [],
    requestBody: result.requestBody,
    viewType: "solman_create_transport_request_success",
  };

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary: reply,
    extracted: {
      system: "solman",
      intent: INTENT,
      payload: collected,
    },
    data: persistedData,
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.transport.createTransportRequest",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
    },
  });

  sse.send("reply", {
    ok: true,
    sessionId: String(session._id),
    systemId: effectiveSystemId,
    sapUser: effectiveSapUser,
    reply,
    summary: reply,
    data: persistedData,
  });

  sse.send("done", { ok: true });
  return sse.end();
}
import { cleanString, persistAssistantAndTouchSession } from "./solman.shared.js";

const INTENT = "RELEASE_TRANSPORT_TASK";
const FORM_ID = "solman_release_transport_task";
const SAP_ENDPOINT = "/sap/opu/odata/sap/ZTASK_RELEASE_SRV/ZTask_releaseSet";

function normalizeQuery(query = "") {
  return cleanString(query)
    .toLowerCase()
    .replace(/\btransport requests?\b/g, "transport")
    .replace(/\s+/g, " ")
    .trim();
}

export function isReleaseTransportRequest(query = "") {
  const q = normalizeQuery(query);
  return /\brelease\b.*\b(?:transport|request)\b/i.test(q) && !/\btask\b/i.test(q);
}

export function isReleaseTransportTaskRequest(query = "") {
  const q = normalizeQuery(query);
  if (!q) return false;
  if (isReleaseTransportRequest(q)) return false;
  return /\brelease\b.*\b(?:task|transport task)\b/i.test(q);
}

function cleanTaskId(value = "") {
  return cleanString(value).toUpperCase();
}

function pickTaskId(raw = {}, query = "") {
  const q = String(query || "");
  return cleanTaskId(
    raw.taskId || raw.taskID || raw.TaskId || raw.IvTaskId || q.match(/\b(?:task|transport\s+task)\s*(?:number\s*)?([A-Z]{2,6}\d{4,20})\b/i)?.[1] || ""
  );
}

function buildFormResponse(prefilledData, missingFields) {
  return {
    intent: INTENT,
    action: { type: "open_form", formId: FORM_ID },
    formId: FORM_ID,
    prefilledData,
    missingFields,
  };
}

function getMissingFields(payload = {}) {
  return cleanTaskId(payload.taskId) ? [] : ["taskId"];
}

function buildReply({ taskId, message }) {
  return [
    "✅ Transport task released successfully.",
    "",
    `Task Number:\n${taskId}`,
    "",
    `SAP Message:\n${message}`,
  ].join("\n");
}

function mapReleaseErrorMessage(error, taskId) {
  const message = String(error?.message || "");
  if (/No service found for namespace/i.test(message) || /service not found/i.test(message) || /not active/i.test(message)) {
    return `SAP release service is not active or the service name is incorrect for task ${taskId || "the provided task"}. Check SOLMAN_RELEASE_TASK_SERVICE_NAME or activate the OData service in SAP Gateway.`;
  }
  return message || `Unable to release task ${taskId || ""}.`;
}

export async function handleReleaseTransportTask(context) {
  const { sse, owner, query, session, effectiveSystemId, effectiveSapUser, classified } = context;

  console.log("[ReleaseTask] Intent detected");

  const taskId = pickTaskId(classified?.entities || {}, query);
  const missingFields = getMissingFields({ taskId });
  const formResponse = buildFormResponse({ taskId }, missingFields);
  const message = taskId
    ? `Please confirm release for transport task ${taskId}.`
    : "Please enter the transport task number to release.";

  console.log("[ReleaseTask] Opening form");

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: message,
    summary: taskId
      ? `Asked user to confirm release for task ${taskId}.`
      : "Asked user to provide the task number for release.",
    extracted: {
      system: "solman",
      intent: INTENT,
      pending: true,
      taskId: taskId || null,
    },
    data: formResponse,
    responseMeta: {
      ok: false,
      kind: "stream",
      executor: "solman.transport.releaseTransportTask",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      status: "needs_input",
    },
  });

  sse.send("error", {
    ok: false,
    message,
    status: "needs_input",
    ...formResponse,
  });
  return sse.end();
}


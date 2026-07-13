import { ChatSession } from "../../../models/ChatSession.model.js";
import { cleanString, persistAssistantAndTouchSession } from "./solman.shared.js";
import { step } from "../stream.shared.js";

const INTENT = "CREATE_TRANSPORT_TASK";
const FORM_ID = "solman_create_transport_task";
const SAP_ENDPOINT = "/sap/opu/odata/sap/ZCREATE_TRANSPORT_TASKS_SRV/TransportTaskSet";

function normalizeText(value = "") {
  return cleanString(value);
}

function normalizeQuery(query = "") {
  return normalizeText(query)
    .toLowerCase()
    .replace(/\bchange requests?\b/g, "cr")
    .replace(/\btransport requests?\b/g, "transport")
    .replace(/\s+/g, " ")
    .trim();
}

export function isCreateCrRequest(query = "") {
  const q = normalizeQuery(query);
  return /(create|raise|generate).*(change request|cr)\b/i.test(q) && !/(task|tasks|transport task)/i.test(q);
}

export function isCreateTransportTaskRequest(query = "") {
  const q = normalizeQuery(query);
  if (!q) return false;
  if (isCreateCrRequest(q)) return false;
  return /(create|add).*(task|tasks)/i.test(q);
}

function cleanDeveloper(value = "") {
  return normalizeText(value).toUpperCase();
}

function uniqueDevelopers(values = []) {
  const seen = new Set();
  const developers = [];

  for (const value of Array.isArray(values) ? values : []) {
    const developer = cleanDeveloper(value);
    if (!developer || seen.has(developer)) continue;
    seen.add(developer);
    developers.push(developer);
  }

  return developers;
}

function extractDevelopersFromText(query = "") {
  const q = String(query || "");
  const matches = [];

  const keywordPatterns = [
    /\bdevelopers?\b[:\s-]*([\s\S]*?)(?=\b(?:under\s+transport|for\s+cr|for\s+change\s+request|for\s+transport|change\s+request|transport|cr)\b|$)/i,
    /\bdeveloper\b[:\s-]*([\s\S]*?)(?=\b(?:under\s+transport|for\s+cr|for\s+change\s+request|for\s+transport|change\s+request|transport|cr)\b|$)/i,
  ];

  for (const pattern of keywordPatterns) {
    const match = q.match(pattern);
    if (!match?.[1]) continue;
    const tokens = match[1].match(/\b[A-Z][A-Z0-9]{3,19}\b/g) || [];
    matches.push(...tokens);
  }

  return uniqueDevelopers(matches);
}

function pickTransportTaskEntities(raw = {}, query = "") {
  const q = String(query || "");

  const transportNo = normalizeText(
    raw.transportNo || raw.transportNumber || raw.transport || raw.Trkorr || raw.TRKORR || q.match(/\b(?:transport|tr)\s*(?:number\s*)?([A-Z]{2,6}\d{4,20})\b/i)?.[1] || ""
  ).toUpperCase();

  const changeRequest = normalizeText(
    raw.changeRequest || raw.changeRequestId || raw.objectId || raw.OBJECT_ID || q.match(/\b(?:cr|change request)\s*(?:number\s*)?([0-9]{6,20})\b/i)?.[1] || ""
  );

  const developers = uniqueDevelopers([
    ...(Array.isArray(raw.developers) ? raw.developers : []),
    ...(Array.isArray(raw.Developers) ? raw.Developers : []),
    ...(typeof raw.developers === "string" ? raw.developers.split(/[,;\n]+/) : []),
    ...extractDevelopersFromText(q),
  ]);

  return {
    intent: INTENT,
    transportNo,
    changeRequest,
    developers,
  };
}

function getMissingFields(payload = {}) {
  const missing = [];

  if (!normalizeText(payload.transportNo)) missing.push("transportNo");
  if (!normalizeText(payload.changeRequest)) missing.push("changeRequest");
  if (!Array.isArray(payload.developers) || payload.developers.length === 0) missing.push("developers");

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
    missingFields,
    prefilledData,
  };
}

function buildSapPayload({ transportNo, changeRequest, developers }) {
  return {
    IM_TRANSPORT_NO: transportNo,
    IM_SOLMAN_CHANGE_REQ: changeRequest,
    DEVELOPERS: JSON.stringify(
      developers.map((developer) => ({ developer }))
    ),
  };
}

function normalizeSapHeaders(auth) {
  return {
    Authorization: `Basic ${auth}`,
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

function parseJsonSafe(value, fallback) {
  if (!value) return fallback;
  if (typeof value !== "string") return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function parseResponseBodySafely(rawText, contentType) {
  if (!rawText) return {};
  if (contentType.includes("application/json")) {
    try {
      return JSON.parse(rawText);
    } catch {
      return { raw: rawText };
    }
  }

  return { raw: rawText };
}

function buildBaseUrlFromSystem(system = {}) {
  const protocol = normalizeText(system?.protocol || "https").toLowerCase() === "http" ? "http" : "https";
  const host = normalizeText(system?.host);
  const port = normalizeText(system?.port);

  if (!host) return "";

  return `${protocol}://${host}${port ? `:${port}` : ""}`;
}

function parseSapResponse(response = {}) {
  const data = response?.d || response?.data?.d || response?.raw?.d || response?.body?.d || {};
  const status = normalizeText(data.EV_TR_OUTPUT_MSG || data.EV_OUTPUT_MSG || data.STATUS || data.STATUS_TEXT || "").toUpperCase() || "S";
  const messages = parseJsonSafe(data.TASK_MESSAGE, []);
  const tasks = parseJsonSafe(data.TASKS, []);

  return {
    success: status === "S",
    status,
    messages: Array.isArray(messages) ? messages : [],
    tasks: Array.isArray(tasks) ? tasks : [],
  };
}

async function callTransportTaskSap({ system, sapAuth, payload }) {
  const baseUrl = normalizeText(system?.baseUrl) || buildBaseUrlFromSystem(system);
  const username = normalizeText(sapAuth?.username);
  const password = normalizeText(sapAuth?.password);

  if (!baseUrl) {
    throw Object.assign(new Error("SAP system endpoint is missing."), { code: "INVALID_SYSTEM" });
  }

  if (!username || !password) {
    throw Object.assign(new Error("SAP credentials are missing."), { code: "INVALID_AUTH" });
  }

  const auth = Buffer.from(`${username}:${password}`).toString("base64");
  const endpoint = `${baseUrl.replace(/\/+$/, "")}${SAP_ENDPOINT}`;

  const response = await fetch(endpoint, {
    method: "POST",
    headers: normalizeSapHeaders(auth),
    body: JSON.stringify(payload),
  });

  const contentType = response.headers.get("content-type") || "";
  const rawText = await response.text();
  const rawBody = parseResponseBodySafely(rawText, contentType);

  if (!response.ok) {
    const error = new Error("Unable to create transport tasks.");
    error.code = "SAP_REQUEST_FAILED";
    error.status = response.status;
    error.responseData = rawBody;
    throw error;
  }

  return rawBody;
}

function buildReply({ transportNo, changeRequest, developers, sapResult }) {
  return [
    "Transport tasks created successfully.",
    `Transport Number: ${transportNo}`,
    `Change Request Number: ${changeRequest}`,
    `Developers: ${developers.join(", ")}`,
    sapResult.messages.length > 0 ? `Message: ${sapResult.messages.join(" | ")}` : null,
  ].filter(Boolean).join("\n");
}

export async function handleCreateTransportTask(context) {
  const { sse, owner, query, session, system, sapAuth, effectiveSystemId, effectiveSapUser, classified } = context;

  console.log("[CreateTask] Intent detected");

  const collected = pickTransportTaskEntities(classified?.entities || {}, query);
  const missingFields = getMissingFields(collected);

  if (missingFields.length > 0) {
    const message = "Please complete the required transport task details.";
    console.log("[CreateTask] Form opened");

    const formResponse = buildFormResponse(collected, missingFields);

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user to complete required transport task details.",
      extracted: {
        system: "solman",
        intent: "create_transport_task",
        pending: true,
        payload: collected,
        missingFields,
      },
      data: formResponse,
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport.createTransportTask",
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
      ...formResponse,
    });
    return sse.end();
  }

  const payload = buildSapPayload(collected);
  console.log("[CreateTask] Calling SAP");

  const result = await step("createTransportTask", () =>
    callTransportTaskSap({ system, sapAuth, payload })
  );

  const sapResult = parseSapResponse(result);

  if (!sapResult.success) {
    console.log("[CreateTask] SAP failed");
    const message = "Unable to create transport tasks.";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Transport task creation failed.",
      extracted: {
        system: "solman",
        intent: "create_transport_task",
        payload: collected,
      },
      data: {
        success: false,
        status: sapResult.status,
        messages: sapResult.messages,
        tasks: sapResult.tasks,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport.createTransportTask",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "execution_failed",
      },
    });

    sse.send("error", {
      ok: false,
      status: "execution_failed",
      errorCode: "SAP_REQUEST_FAILED",
      message,
      sap: {
        status: sapResult.status,
        messages: sapResult.messages,
        tasks: sapResult.tasks,
      },
    });
    return sse.end();
  }

  console.log("[CreateTask] SAP success");

  const reply = buildReply({
    transportNo: collected.transportNo,
    changeRequest: collected.changeRequest,
    developers: collected.developers,
    sapResult,
  });

  const storedData = {
    success: true,
    status: sapResult.status,
    messages: sapResult.messages,
    tasks: sapResult.tasks,
    payload,
  };

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary: "Transport tasks created successfully.",
    extracted: {
      system: "solman",
      intent: "create_transport_task",
      payload: collected,
    },
    data: storedData,
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.transport.createTransportTask",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
    },
  });

  await ChatSession.updateOne(
    { _id: session._id },
    { $set: { updatedAt: new Date() } }
  );

  sse.send("reply", {
    ok: true,
    sessionId: String(session._id),
    systemId: effectiveSystemId,
    sapUser: effectiveSapUser,
    reply,
    summary: "Transport tasks created successfully.",
    data: storedData,
    suggestions: [
      `Show transports for CR ${collected.changeRequest}`,
      `Create another transport task for CR ${collected.changeRequest}`,
    ],
  });

  sse.send("done", { ok: true });
  return sse.end();
}

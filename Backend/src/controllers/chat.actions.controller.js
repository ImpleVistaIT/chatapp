import { createSapActionHandler } from "./_shared/createSapActionHandler.js";
import { resolveSapConnection } from "../services/sap/sapConnectionResolver.service.js";
import {
  createSolmanChangeRequest,
  getSolmanChangeRequestDetailsById,
  listSolmanChangeRequestsByDateRange,
} from "../services/systems/solman/charm.service.js";
import { getPurchaseOrderDetails } from "../services/systems/s4hana/po.service.js";
import { getTransportNumbersFromCr } from "../services/systems/solman/transport.service.js";
import { createTransportRequest } from "../services/systems/solman/transportRequest.service.js";
import { postToSap } from "../services/sap/sapWrite.service.js";
import { persistAssistantAndTouchSession } from "./stream/solman/solman.shared.js";

function cleanString(v) {
  return String(v || "").trim();
}

function resolveCurrentSolmanUsername(connection) {
  return cleanString(
    connection?.sapAuth?.username ||
      connection?.sapAuth?.user ||
      connection?.sapAuth?.sapUser ||
      connection?.sapAuth?.USER ||
      ""
  ).toUpperCase();
}

function validateCreateChangeRequestInput(body) {
  console.log("[chat.actions] create-change-request input", {
    systemId: cleanString(body?.systemId),
    sapUser: cleanString(body?.sapUser),
    payloadKeys: body?.payload && typeof body.payload === "object" ? Object.keys(body.payload) : [],
  });

  if (!cleanString(body?.systemId)) {
    console.warn("[chat.actions] create-change-request blocked: missing systemId", {
      systemId: cleanString(body?.systemId),
      sapUser: cleanString(body?.sapUser),
      payload: body?.payload || null,
    });
    return "systemId is required.";
  }

  if (!cleanString(body?.sapUser)) {
    console.warn("[chat.actions] create-change-request blocked: missing sapUser", {
      systemId: cleanString(body?.systemId),
      sapUser: cleanString(body?.sapUser),
      payload: body?.payload || null,
    });
    return "sapUser is required.";
  }

  if (!body?.payload || typeof body.payload !== "object") {
    console.warn("[chat.actions] create-change-request blocked: missing payload", {
      systemId: cleanString(body?.systemId),
      sapUser: cleanString(body?.sapUser),
    });
    return "payload is required.";
  }

  return null;
}

function validateGetChangeRequestDetailsInput(body) {
  if (!cleanString(body?.systemId)) {
    return "systemId is required.";
  }

  if (!cleanString(body?.sapUser)) {
    return "sapUser is required.";
  }

  if (!cleanString(body?.objectId)) {
    return "objectId is required.";
  }

  return null;
}

function validateListChangeRequestsInput(body) {
  if (!cleanString(body?.systemId)) {
    return "systemId is required.";
  }

  if (!cleanString(body?.sapUser)) {
    return "sapUser is required.";
  }

  if (!cleanString(body?.fromDate)) {
    return "fromDate is required.";
  }

  if (!cleanString(body?.toDate)) {
    return "toDate is required.";
  }

  return null;
}

function validateListTransportsInput(body) {
  if (!cleanString(body?.systemId)) {
    return "systemId is required.";
  }

  if (!cleanString(body?.sapUser)) {
    return "sapUser is required.";
  }

  if (!cleanString(body?.objectId)) {
    return "objectId is required.";
  }

  return null;
}

function validateCreateTransportRequestInput(body) {
  if (!cleanString(body?.systemId)) {
    return "systemId is required.";
  }

  if (!cleanString(body?.sapUser)) {
    return "sapUser is required.";
  }

  if (!body?.payload || typeof body.payload !== "object") {
    return "payload is required.";
  }

  if (!cleanString(body?.payload?.SolmanChangeReq)) {
    return "SolmanChangeReq is required.";
  }

  if (!cleanString(body?.payload?.TrOwner)) {
    return "TrOwner is required.";
  }

  if (!cleanString(body?.payload?.Client)) {
    return "Client is required.";
  }

  return null;
}

function validateGetPurchaseOrderDetailsInput(body) {
  if (!cleanString(body?.systemId)) {
    return "systemId is required.";
  }

  if (!cleanString(body?.sapUser)) {
    return "sapUser is required.";
  }

  if (!cleanString(body?.purchaseOrderId)) {
    return "purchaseOrderId is required.";
  }

  return null;
}

function validateCreateTransportTaskInput(body) {
  if (!cleanString(body?.systemId)) {
    return "systemId is required.";
  }

  if (!cleanString(body?.sapUser)) {
    return "sapUser is required.";
  }

  if (!body?.payload || typeof body.payload !== "object") {
    return "payload is required.";
  }

  if (!cleanString(body?.payload?.IM_TRANSPORT_NO)) {
    return "transportNo is required.";
  }

  if (!cleanString(body?.payload?.IM_SOLMAN_CHANGE_REQ)) {
    return "changeRequest is required.";
  }

  return null;
}

function extractCrNumberFromMessage(message) {
  const text = cleanString(message);
  if (!text) return "";

  const match = text.match(/\bCR\s*[:#-]?\s*(\d{6,})\b/i);
  return match?.[1] ? cleanString(match[1]) : "";
}

export const submitSolmanCreateChangeRequest = createSapActionHandler({
  executor: "solman.charm.createChangeRequest",

  validate: validateCreateChangeRequestInput,

  execute: async ({ owner, body }) => {
    const connection = await resolveSapConnection({
      owner,
      systemId: body.systemId,
      sapUser: body.sapUser,
    });

    const result = await createSolmanChangeRequest({
      system: connection.system,
      sapAuth: connection.sapAuth,
      payload: body.payload,
    });

    console.log("[chat.actions] create-change-request SAP response", {
      ok: result?.ok,
      message: result?.message,
      changeRequestId: result?.changeRequestId || null,
      status: result?.status || null,
      msgType: result?.msgType || null,
      raw: result?.raw || null,
    });

    const messageCrNumber = extractCrNumberFromMessage(result?.message);
    const responseCrNumber = cleanString(result?.changeRequestId || result?.ESolmanCr || messageCrNumber);

    console.log("[chat.actions] create-change-request derived CR", {
      responseCrNumber,
      messageCrNumber,
      message: result?.message || null,
    });

    const responseSummary = {
      changeRequestId: responseCrNumber || null,
      status: cleanString(result?.status || result?.EMsgType || result?.msgType || ""),
      shortDesc: cleanString(body?.payload?.ShortDesc),
      deliveryResponsible: cleanString(body?.payload?.DeliveryResponsible),
      developer: cleanString(body?.payload?.Developer),
      tester: cleanString(body?.payload?.Tester),
      workItemReference: cleanString(body?.payload?.WorkItemReference),
      landscape: cleanString(body?.payload?.Landscape),
      reqUrlNav: Array.isArray(body?.payload?.REQ_URL_NAV)
        ? body.payload.REQ_URL_NAV
            .map((item) => ({
              URL: cleanString(item?.URL),
              URL_NAME: cleanString(item?.URL_NAME),
            }))
            .filter((item) => item.URL || item.URL_NAME)
        : [],
    };

    const sessionId = String(body?.sessionId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(sessionId)) {
      await persistAssistantAndTouchSession({
        owner,
        sessionId,
        text: responseCrNumber
          ? `CR ${responseCrNumber} created successfully.`
          : result?.message || "Change request created successfully.",
        summary: responseCrNumber
          ? `CR ${responseCrNumber} created successfully.`
          : result?.message || "Change request created successfully.",
        extracted: {
          system: "solman",
          intent: "create_change_request",
          changeRequestId: responseCrNumber || null,
          status: cleanString(result?.status || result?.EMsgType || result?.msgType || "") || null,
        },
        data: {
          viewType: "solman_create_cr_success",
          ...responseSummary,
          raw: result?.raw || null,
        },
        responseMeta: {
          ok: true,
          kind: "action",
          executor: "solman.charm.createChangeRequest",
          systemId: connection.system?.systemId || body?.systemId || "",
          sapUser: connection.sapAuth?.username || connection.sapAuth?.sapUser || body?.sapUser || "",
        },
      });
    }

    if (!result?.ok) {
      const err = new Error(
        result?.message || "Failed to create change request."
      );
      err.status = result?.statusCode || 400;
      err.code = result?.code || "EXECUTION_FAILED";
      throw err;
    }

    return {
      ...result,
      changeRequestId: responseCrNumber,
      ESolmanCr: responseCrNumber,
      status: cleanString(result?.status || result?.EMsgType || result?.msgType || ""),
      summary: responseSummary,
      submittedFields: {
        ShortDesc: cleanString(body?.payload?.ShortDesc),
        DeliveryResponsible: cleanString(body?.payload?.DeliveryResponsible),
        Developer: cleanString(body?.payload?.Developer),
        Tester: cleanString(body?.payload?.Tester),
        WorkItemReference: cleanString(body?.payload?.WorkItemReference),
        Landscape: cleanString(body?.payload?.Landscape),
        REQ_URL_NAV: Array.isArray(body?.payload?.REQ_URL_NAV)
          ? body.payload.REQ_URL_NAV.map((item) => ({
              URL: cleanString(item?.URL),
              URL_NAME: cleanString(item?.URL_NAME),
            }))
          : [],
      },
    };
  },

  mapSuccessResult: (result) => ({
    changeRequestId: result.changeRequestId,
    status: result.status,
    summary: {
      ShortDesc: result.submittedFields?.ShortDesc || "",
      DeliveryResponsible: result.submittedFields?.DeliveryResponsible || "",
      Developer: result.submittedFields?.Developer || "",
      Tester: result.submittedFields?.Tester || "",
      WorkItemReference: result.submittedFields?.WorkItemReference || "",
      Landscape: result.submittedFields?.Landscape || "",
      REQ_URL_NAV: Array.isArray(result.submittedFields?.REQ_URL_NAV)
        ? result.submittedFields.REQ_URL_NAV
        : [],
    },
    raw: result.raw,
  }),
});

export const getSolmanChangeRequestDetails = createSapActionHandler({
  executor: "solman.charm.getChangeRequestDetails",

  validate: validateGetChangeRequestDetailsInput,

  execute: async ({ owner, body }) => {
    const connection = await resolveSapConnection({
      owner,
      systemId: body.systemId,
      sapUser: body.sapUser,
    });

    return await getSolmanChangeRequestDetailsById({
      system: connection.system,
      sapAuth: connection.sapAuth,
      objectId: body.objectId,
      processType: body.processType || "YMHF",
    });
  },

  mapSuccessResult: (result) => ({
    objectId: result.objectId,
    processType: result.processType,
    count: result.count,
    results: result.results,
    raw: result.raw,
  }),
});

export const listSolmanChangeRequests = createSapActionHandler({
  executor: "solman.charm.listChangeRequests",

  validate: validateListChangeRequestsInput,

  execute: async ({ owner, body }) => {
    const connection = await resolveSapConnection({
      owner,
      systemId: body.systemId,
      sapUser: body.sapUser,
    });

    let createdBy = cleanString(body.createdBy || "");
    if (cleanString(body.createdByMode).toLowerCase() === "self") {
      createdBy = resolveCurrentSolmanUsername(connection);
    }

    return await listSolmanChangeRequestsByDateRange({
      system: connection.system,
      sapAuth: connection.sapAuth,
      processType: body.processType || "YMHF",
      fromDate: body.fromDate,
      toDate: body.toDate,
      triggerAll: body.triggerAll || "X",
      createdBy,
      createdByMode: body.createdByMode || "",
      status: body.status || "",
      statusMode: body.statusMode || "",
      excludeStatuses: Array.isArray(body.excludeStatuses) ? body.excludeStatuses : [],
      top: body.top ?? null,
      skip: body.skip ?? 0,
      orderBy: body.orderBy || "CREATED_ON desc",
    });
  },

  mapSuccessResult: (result) => ({
    processType: result?.result?.processType || result?.processType,
    fromDate: result?.result?.fromDate || result?.fromDate,
    toDate: result?.result?.toDate || result?.toDate,
    triggerAll: result?.result?.triggerAll || result?.triggerAll,
    createdBy: result?.result?.createdBy || result?.createdBy || "",
    count: result?.result?.count ?? result?.count ?? 0,
    results: Array.isArray(result?.result?.results)
      ? result.result.results
      : Array.isArray(result?.results)
        ? result.results
        : [],
    raw: result?.result?.raw || result?.raw || null,
    status: result?.result?.status || result?.status || "",
    statusMode: result?.result?.statusMode || result?.statusMode || "",
    excludeStatuses:
      result?.result?.excludeStatuses || result?.excludeStatuses || [],
    top: result?.result?.top ?? result?.top ?? null,
    skip: result?.result?.skip ?? result?.skip ?? 0,
    orderBy: result?.result?.orderBy || result?.orderBy || "CREATED_ON desc",
    nextSkip: result?.result?.nextSkip ?? result?.nextSkip ?? 0,
  }),
});

export const submitSolmanCreateTransportRequest = createSapActionHandler({
  executor: "solman.transport.createTransportRequest",

  validate: validateCreateTransportRequestInput,

  execute: async ({ owner, body }) => {
    const connection = await resolveSapConnection({
      owner,
      systemId: body.systemId,
      sapUser: body.sapUser,
    });

    return await createTransportRequest({
      system: connection.system,
      sapAuth: connection.sapAuth,
      payload: body.payload,
    });
  },

  mapSuccessResult: (result) => ({
    transportRequest: result?.result?.transportRequest || "",
    workbenchTransport: result?.result?.workbenchTransport || "",
    customizingTransport: result?.result?.customizingTransport || "",
    message: result?.message || "Transport Request created successfully.",
    raw: result?.result?.raw || null,
  }),
});

export const listSolmanTransports = createSapActionHandler({
  executor: "solman.transport.listTransports",

  validate: validateListTransportsInput,

  execute: async ({ owner, body }) => {
    const connection = await resolveSapConnection({
      owner,
      systemId: body.systemId,
      sapUser: body.sapUser,
    });

    return await getTransportNumbersFromCr({
      system: connection.system,
      sapAuth: connection.sapAuth,
      changeRequestId: body.objectId,
      processType: body.processType || "",
    });
  },

  mapSuccessResult: (result) => ({
    changeRequestId: result?.result?.changeRequestId || result?.changeRequestId || "",
    processType: result?.result?.processType || result?.processType || "",
    transports: Array.isArray(result?.result?.rows)
      ? result.result.rows
      : [],
    count: Array.isArray(result?.result?.rows) ? result.result.rows.length : 0,
    raw: result?.result?.raw || result?.raw || null,
    message: result?.message || "",
  }),
});

export const submitSolmanCreateTransportTask = createSapActionHandler({
  executor: "solman.transport.createTransportTask",

  validate: validateCreateTransportTaskInput,

  execute: async ({ owner, body }) => {
    const connection = await resolveSapConnection({
      owner,
      systemId: body.systemId,
      sapUser: body.sapUser,
    });

    const raw = await postToSap(
      {
        system: connection.system,
        relativePath: "/sap/opu/odata/sap/ZCREATE_TRANSPORT_TASKS_SRV/TransportTaskSet",
        body: body.payload,
      },
      connection.sapAuth
    );

    const d = raw?.d || raw || {};
    const status = String(d?.EV_TR_OUTPUT_MSG || d?.EV_OUTPUT_MSG || d?.STATUS || d?.STATUS_TEXT || "S").trim();
    const taskMessage = String(d?.TASK_MESSAGE || "[]").trim();
    const tasks = String(d?.TASKS || "[]").trim();

    const responseSummary = {
      transportNo: cleanString(body?.payload?.IM_TRANSPORT_NO),
      changeRequest: cleanString(body?.payload?.IM_SOLMAN_CHANGE_REQ),
      developers: (() => {
        try {
          return JSON.parse(String(body?.payload?.DEVELOPERS || "[]"))
            .map((item) => cleanString(item?.developer))
            .filter(Boolean);
        } catch {
          return [];
        }
      })(),
      status,
      taskMessage,
      tasks,
    };

    const sessionId = String(body?.sessionId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(sessionId)) {
      await persistAssistantAndTouchSession({
        owner,
        sessionId,
        text: `Transport task creation completed for CR ${responseSummary.changeRequest}.`,
        summary: `Transport task creation completed for CR ${responseSummary.changeRequest}.`,
        extracted: {
          system: "solman",
          intent: "create_transport_task",
          transportNo: responseSummary.transportNo,
          changeRequest: responseSummary.changeRequest,
          developers: responseSummary.developers,
          status,
        },
        data: {
          viewType: "solman_create_transport_task_success",
          ...responseSummary,
          raw,
        },
        responseMeta: {
          ok: true,
          kind: "action",
          executor: "solman.transport.createTransportTask",
          systemId: connection.system?.systemId || body?.systemId || "",
          sapUser: connection.sapAuth?.username || connection.sapAuth?.sapUser || body?.sapUser || "",
        },
      });

    }

    return {
      ok: true,
      message: `Transport task creation completed for CR ${responseSummary.changeRequest}.`,
      summary: responseSummary,
      raw,
    };
  },

  mapSuccessResult: (result) => ({
    ...result,
    summary: result.summary,
    raw: result.raw,
  }),
});

export const submitSolmanReleaseTransportTask = createSapActionHandler({
  executor: "solman.transport.releaseTransportTask",

  validate: (body) => {
    if (!cleanString(body?.systemId)) return "systemId is required.";
    if (!cleanString(body?.sapUser)) return "sapUser is required.";
    if (!body?.payload || typeof body.payload !== "object") return "payload is required.";
    if (!cleanString(body?.payload?.IvTaskId)) return "Task number is required.";
    return null;
  },

  execute: async ({ owner, body }) => {
    const connection = await resolveSapConnection({
      owner,
      systemId: body.systemId,
      sapUser: body.sapUser,
    });

    const serviceName = String(process.env.SOLMAN_RELEASE_TASK_SERVICE_NAME || "ZTASK_RELEASE_SRV").trim();
    const entitySetName = String(process.env.SOLMAN_RELEASE_TASK_ENTITYSET || "ZTask_releaseSet").trim();

    const taskId = cleanString(body?.payload?.IvTaskId).toUpperCase();

    let raw;
    try {
      raw = await postToSap(
        {
          system: connection.system,
          relativePath: `/sap/opu/odata/sap/${serviceName}/${entitySetName}`,
          body: { IvTaskId: taskId },
        },
        connection.sapAuth
      );
    } catch (error) {
      const message = String(error?.message || "");
      if (/No service found for namespace/i.test(message) || /service not found/i.test(message) || /not active/i.test(message)) {
        const friendly = `SAP service ${serviceName} is not active on this system, or the service name/entity set is wrong. Activate it in SAP Gateway or update SOLMAN_RELEASE_TASK_SERVICE_NAME / SOLMAN_RELEASE_TASK_ENTITYSET.`;
        const wrapped = new Error(friendly);
        wrapped.status = 404;
        wrapped.code = "SAP_SERVICE_NOT_FOUND";
        wrapped.userMessage = friendly;
        throw wrapped;
      }
      throw error;
    }

    const d = raw?.d || raw || {};
    const responseTaskId = cleanString(d?.IvTaskId || taskId).toUpperCase();
    const responseMessage = cleanString(d?.EvMessage || d?.EV_MESSAGE || `Task ${responseTaskId} released successfully`);

    const sessionId = String(body?.sessionId || "").trim();
    if (/^[a-f0-9]{24}$/i.test(sessionId)) {
      await persistAssistantAndTouchSession({
        owner,
        sessionId,
        text: `✅ Transport task released successfully.\n\nTask Number:\n${responseTaskId}\n\nSAP Message:\n${responseMessage}`,
        summary: responseMessage,
        extracted: {
          system: "solman",
          intent: "release_transport_task",
          taskId: responseTaskId,
        },
        data: {
          viewType: "solman_release_transport_task_success",
          taskId: responseTaskId,
          message: responseMessage,
          raw,
        },
        responseMeta: {
          ok: true,
          kind: "action",
          executor: "solman.transport.releaseTransportTask",
          systemId: connection.system?.systemId || body?.systemId || "",
          sapUser: connection.sapAuth?.username || connection.sapAuth?.sapUser || body?.sapUser || "",
        },
      });

    }

    return {
      ok: true,
      message: responseMessage,
      taskId: responseTaskId,
      raw,
    };
  },

  mapSuccessResult: (result) => ({
    taskId: result.taskId,
    message: result.message,
    raw: result.raw,
  }),
});

export const getPurchaseOrderDetailsAction = createSapActionHandler({
  executor: "s4hana.mm.getPurchaseOrderDetails",

  validate: validateGetPurchaseOrderDetailsInput,

  execute: async ({ owner, body }) => {
    const connection = await resolveSapConnection({
      owner,
      systemId: body.systemId,
      sapUser: body.sapUser,
    });

    return await getPurchaseOrderDetails({
      req: {
        sapSystem: connection.system,
        sapService: {
          serviceName: body.serviceName || process.env.DEFAULT_PO_SERVICE_NAME || "ZMM_PO_DETAILS_SRV",
          entitySet: body.entitySet || process.env.DEFAULT_PO_ENTITYSET || "Po_detailsSet",
        },
        sapAuth: connection.sapAuth,
      },
      purchaseOrderId: body.purchaseOrderId,
    });
  },

  mapSuccessResult: (result) => ({
    rows: result.rows || [],
    totalCount: result.totalCount || null,
    data: result.data || null,
  }),
});
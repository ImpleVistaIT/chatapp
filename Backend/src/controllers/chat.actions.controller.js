import { createSapActionHandler } from "./_shared/createSapActionHandler.js";
import { resolveSapConnection } from "../services/sap/sapConnectionResolver.service.js";
import {
  createSolmanChangeRequest,
  getSolmanChangeRequestDetailsById,
  listSolmanChangeRequestsByDateRange,
} from "../services/systems/solman/charm.service.js";

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
  if (!cleanString(body?.systemId)) {
    return "systemId is required.";
  }

  if (!cleanString(body?.sapUser)) {
    return "sapUser is required.";
  }

  if (!body?.payload || typeof body.payload !== "object") {
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

    if (!result?.ok) {
      const err = new Error(
        result?.message || "Failed to create change request."
      );
      err.status = result?.statusCode || 400;
      err.code = result?.code || "EXECUTION_FAILED";
      throw err;
    }

    return result;
  },

  mapSuccessResult: (result) => ({
    changeRequestId: result.changeRequestId,
    status: result.status,
    msgType: result.msgType,
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
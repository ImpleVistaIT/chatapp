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

    return await listSolmanChangeRequestsByDateRange({
      system: connection.system,
      sapAuth: connection.sapAuth,
      processType: body.processType || "YMHF",
      fromDate: body.fromDate,
      toDate: body.toDate,
      triggerAll: body.triggerAll || "X",
    });
  },

  mapSuccessResult: (result) => ({
    processType: result.processType,
    fromDate: result.fromDate,
    toDate: result.toDate,
    triggerAll: result.triggerAll,
    count: result.count,
    results: result.results,
    raw: result.raw,
  }),
});
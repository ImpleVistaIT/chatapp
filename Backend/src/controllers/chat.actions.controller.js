import { createSapActionHandler } from "./_shared/createSapActionHandler.js";
import { resolveSapConnection } from "../services/sap/sapConnectionResolver.service.js";
import { createSolmanChangeRequest } from "../services/systems/solman/charm.service.js";

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
      err.status = 400;
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
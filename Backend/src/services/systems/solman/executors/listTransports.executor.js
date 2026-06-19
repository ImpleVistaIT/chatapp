import { getTransportNumbersFromCr } from "../transport.service.js";
import { resolveSapConnection } from "../../../sap/sapConnectionResolver.service.js";
import { getOwner } from "../../../../controllers/_chat/auth.js";

export async function executeSolmanListTransports({ payload = {}, req }) {
  try {
    const owner = getOwner(req);
    const systemId = String(payload.systemId || req?.body?.systemId || req?.userContext?.systemId || "").trim();
    const sapUser = String(payload.sapUser || req?.body?.sapUser || req?.userContext?.sapUser || "").trim();
    const changeRequestId = String(payload.changeRequestId || payload.objectId || payload.crNumber || "").trim();
    const processType = String(payload.processType || req?.body?.processType || "").trim();

    const connection = await resolveSapConnection({ owner, systemId, sapUser });

    const result = await getTransportNumbersFromCr({
      system: connection.system,
      sapAuth: connection.sapAuth,
      changeRequestId,
      processType,
    });

    return {
      ok: Boolean(result?.ok),
      message: result?.message || `Transport lookup completed for CR ${changeRequestId}.`,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Failed to fetch transports for the specified change request.",
      error: error.message,
    };
  }
}
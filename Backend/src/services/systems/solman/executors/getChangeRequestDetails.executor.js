import { getChangeRequestDetails } from "../charm.service.js";

export async function executeSolmanGetChangeRequestDetails({ payload, req }) {
  try {
    const result = await getChangeRequestDetails({
      changeRequestId: payload.changeRequestId,
      req,
    });

    return {
      ok: true,
      message: `Change request ${payload.changeRequestId} fetched successfully.`,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Failed to fetch change request details.",
      error: error.message,
    };
  }
}
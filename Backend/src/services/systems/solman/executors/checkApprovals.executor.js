import { checkApprovals } from "../s4hana.service.js";

export async function executeS4CheckApprovals({ payload, req }) {
  try {
    const result = await checkApprovals({
      ...payload,
      req,
    });

    return {
      ok: true,
      message: "Approvals fetched successfully.",
      result,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Failed to fetch approvals.",
      error: error.message,
    };
  }
}
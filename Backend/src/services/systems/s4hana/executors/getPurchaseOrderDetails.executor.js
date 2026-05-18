import { getPurchaseOrderDetails } from "../po.service.js";

export async function executeS4GetPurchaseOrderDetails({ payload, req }) {
  try {
    const result = await getPurchaseOrderDetails({
      purchaseOrderId: payload.purchaseOrderId,
      req,
    });

    return {
      ok: true,
      message: `Purchase order ${payload.purchaseOrderId} fetched successfully.`,
      result,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Failed to fetch purchase order details.",
      error: error.message,
    };
  }
}
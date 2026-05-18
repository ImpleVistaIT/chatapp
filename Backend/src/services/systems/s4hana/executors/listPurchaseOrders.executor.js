import { listPurchaseOrders } from "../po.service.js";

export async function listPurchaseOrdersExecutor(context = {}) {
  try {
    const payload = context?.payload || {};
    const req = context?.req || context?.request;

    const result = await listPurchaseOrders({
      ...payload,
      req,
    });

    return {
      ok: true,
      message: "Purchase orders fetched successfully.",
      result,
    };
  } catch (error) {
    return {
      ok: false,
      message: "Failed to fetch purchase orders.",
      error: error.message,
    };
  }
}

export async function executeS4ListPurchaseOrders(context = {}) {
  return listPurchaseOrdersExecutor(context);
}
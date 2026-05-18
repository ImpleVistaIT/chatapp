import { buildExecutionConfirmation } from "./confirmationBuilder.service.js";

const EXECUTOR_MAP = {
  // Add executor mappings only after the files exist
  // "s4hana.mm.listPurchaseOrders": executeS4ListPurchaseOrders,
  // "s4hana.mm.getPurchaseOrderDetails": executeS4GetPurchaseOrderDetails,
  // "s4hana.mm.checkApprovals": executeS4CheckApprovals,
  // "solman.charm.getChangeRequestDetails": executeSolmanGetChangeRequestDetails,
  // "solman.transport.createTransport": executeSolmanCreateTransport,
};

export async function executeResolvedAction({ resolvedActionResponse, req = null }) {
  const executorKey = resolvedActionResponse?.action?.executor;
  const payload = resolvedActionResponse?.action?.payload || {};
  const routing = resolvedActionResponse?.routing || {};

  const executor = EXECUTOR_MAP[executorKey];

  if (!executor) {
    return {
      ok: true,
      status: "ready_for_executor",
      message: `Execution is not wired yet for ${executorKey}.`,
      routing,
      action: resolvedActionResponse?.action || { type: "execute_api" },
      execution: {
        executor: executorKey,
        payload,
      },
    };
  }

  const executionResult = await executor({
    payload,
    req,
    routing,
  });

  return buildExecutionConfirmation({
    routing,
    action: resolvedActionResponse.action,
    executionResult,
  });
}
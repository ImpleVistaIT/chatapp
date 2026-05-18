export function buildExecutionConfirmation({
  routing,
  action,
  executionResult,
}) {
  if (!executionResult?.ok) {
    return {
      ok: false,
      status: "execution_failed",
      message: executionResult?.message || "Execution failed.",
      routing,
      action,
      result: executionResult?.result ?? null,
      error: executionResult?.error ?? null,
    };
  }

  return {
    ok: true,
    status: "completed",
    message: executionResult?.message || "Request completed successfully.",
    routing,
    action: {
      type: "confirm",
      executor: action?.executor || null,
    },
    result: executionResult?.result ?? null,
  };
}
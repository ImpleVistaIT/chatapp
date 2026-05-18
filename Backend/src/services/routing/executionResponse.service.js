export function buildExecutionSuccess({
  message,
  executor,
  result = null,
}) {
  return {
    ok: true,
    status: "completed",
    message: message || "Execution completed successfully.",
    action: {
      type: "confirm",
      executor: executor || null,
    },
    result,
    error: null,
  };
}

export function buildExecutionFailure({
  message,
  executor,
  status = "execution_failed",
  code = "EXECUTION_FAILED",
  details = null,
}) {
  return {
    ok: false,
    status,
    message: message || "Execution failed.",
    action: {
      type: "confirm",
      executor: executor || null,
    },
    result: null,
    error: {
      code,
      details,
    },
  };
}
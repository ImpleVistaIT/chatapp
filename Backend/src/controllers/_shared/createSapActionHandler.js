import { getOwner } from "../_chat/auth.js";
import {
  buildExecutionSuccess,
  buildExecutionFailure,
} from "../../services/routing/executionResponse.service.js";

export function createSapActionHandler({
  executor,
  validate,
  execute,
  mapSuccessResult,
}) {
  if (typeof execute !== "function") {
    throw new Error("createSapActionHandler requires an execute function");
  }

  return async function sapActionHandler(req, res, next) {
    try {
      const owner = getOwner(req);
      const body = req.body || {};

      if (typeof validate === "function") {
        const validationError = validate(body);

        if (validationError) {
          return res.status(400).json(
            buildExecutionFailure({
              status: "validation_failed",
              message: validationError,
              executor,
              code: "VALIDATION_FAILED",
            })
          );
        }
      }

      const result = await execute({
        req,
        res,
        next,
        owner,
        body,
      });

      return res.status(200).json(
        buildExecutionSuccess({
          executor,
          message: result?.message || "Execution completed successfully.",
          result:
            typeof mapSuccessResult === "function"
              ? mapSuccessResult(result)
              : result,
        })
      );
    } catch (error) {
      const httpStatus = Number(error?.status) || 500;

      const status =
        httpStatus === 400
          ? "validation_failed"
          : httpStatus === 404
          ? "not_found"
          : "execution_failed";

      const code =
        httpStatus === 400
          ? "VALIDATION_FAILED"
          : httpStatus === 404
          ? "NOT_FOUND"
          : "EXECUTION_FAILED";

      return res.status(httpStatus).json(
        buildExecutionFailure({
          status,
          code,
          executor,
          message: error.message || "Execution failed.",
          details: {
            httpStatus,
          },
        })
      );
    }
  };
}
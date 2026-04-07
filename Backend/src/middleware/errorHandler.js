import { ApiError } from "../utils/errors.js";

export function errorHandler(err, req, res, next) {
  const status = err instanceof ApiError ? err.status : 500;

  res.status(status).json({
    ok: false,
    error: err.message || "Unknown error",
    details: err.details || null,
  });
}
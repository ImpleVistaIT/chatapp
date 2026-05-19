import { ApiError } from "../utils/errors.js";

export function errorHandler(err, req, res, next) {
  // ✅ important for Express error middleware correctness
  // if response already started, delegate to Express default handler
  if (res.headersSent) {
    return next(err);
  }

  const status = err instanceof ApiError ? err.status : Number(err?.status || err?.statusCode || 500);

  res.status(status).json({
    ok: false,
    error: err?.message || String(err) || "Unknown error",
    details: err?.details || null,
  });
}
import { extractBearerToken, issueAccessTokenFromClaims, validateRefreshCookie } from "../services/auth/auth.service.js";
import { isTokenExpiredError, verifyAccessToken } from "../services/auth/jwt.service.js";

export function requireAuth(req, res, next) {
  const authToken = extractBearerToken(req.headers.authorization);

  if (!authToken) {
    try {
      const refreshPayload = validateRefreshCookie(req.cookies?.refreshToken);
      const newAccessToken = issueAccessTokenFromClaims(refreshPayload);

      req.user = {
        id: String(refreshPayload.id),
        claims: {
          id: refreshPayload.id,
          username: refreshPayload.username || refreshPayload.id,
        },
      };

      res.setHeader("x-access-token", newAccessToken);
      res.setHeader("x-auth-refreshed", "1");

      return next();
    } catch {
      return res.status(401).json({
        ok: false,
        error: "Authentication failed",
        code: "AUTH_REQUIRED",
      });
    }
  }

  try {
    const claims = verifyAccessToken(authToken);

    if (!claims?.id) {
      return res.status(401).json({
        ok: false,
        error: "Authentication failed",
        code: "AUTH_INVALID",
      });
    }

    req.user = {
      id: String(claims.id),
      claims
    };

    return next();
  } catch (err) {
    if (!isTokenExpiredError(err)) {
      console.log("JWT ERROR:", err.message);

      return res.status(401).json({
        ok: false,
        error: "Authentication failed",
        code: "AUTH_INVALID",
      });
    }

    try {
      const refreshPayload = validateRefreshCookie(req.cookies?.refreshToken);
      const newAccessToken = issueAccessTokenFromClaims(refreshPayload);

      req.user = {
        id: String(refreshPayload.id),
        claims: {
          id: refreshPayload.id,
          username: refreshPayload.username || refreshPayload.id,
        },
      };

      res.setHeader("x-access-token", newAccessToken);
      res.setHeader("x-auth-refreshed", "1");

      return next();
    } catch (refreshError) {
      console.log("JWT REFRESH ERROR:", refreshError.message);

      return res.status(401).json({
        ok: false,
        error: "Your session has expired. Please login again.",
        code: refreshError.code || "TOKEN_EXPIRED",
      });
    }
  }
}
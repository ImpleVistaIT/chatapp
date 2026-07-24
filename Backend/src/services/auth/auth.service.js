import { isTokenExpiredError, signAccessToken, verifyRefreshToken } from "./jwt.service.js";

export function extractBearerToken(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith("Bearer ")) {
    return null;
  }

  return authorizationHeader.split(" ")[1]?.trim() || null;
}

export function buildAccessTokenPayload(claims) {
  return {
    id: String(claims?.id || "").trim(),
    username: String(claims?.username || claims?.id || "").trim(),
  };
}

export function issueAccessTokenFromClaims(claims) {
  const payload = buildAccessTokenPayload(claims);

  if (!payload.id) {
    const error = new Error("Invalid token (missing id)");
    error.status = 401;
    throw error;
  }

  return signAccessToken(payload);
}

export function validateRefreshCookie(refreshToken) {
  if (!refreshToken) {
    const error = new Error("Missing refresh token");
    error.status = 401;
    error.code = "TOKEN_EXPIRED";
    throw error;
  }

  try {
    const payload = verifyRefreshToken(refreshToken);

    if (payload?.type !== "refresh" || !payload?.id) {
      const error = new Error("Invalid refresh token");
      error.status = 401;
      error.code = "TOKEN_EXPIRED";
      throw error;
    }

    return payload;
  } catch (error) {
    const wrapped = new Error(isTokenExpiredError(error) ? "Refresh token expired" : "Invalid refresh token");
    wrapped.status = 401;
    wrapped.code = "TOKEN_EXPIRED";
    throw wrapped;
  }
}

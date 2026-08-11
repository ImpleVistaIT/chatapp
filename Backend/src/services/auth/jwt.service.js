import jwt from "jsonwebtoken";

const DEFAULT_ACCESS_TTL = "15m";
const DEFAULT_REFRESH_TTL = "30d";

function getJwtSecret() {
  const secret = process.env.JWT_SECRET;

  if (!secret) {
    const error = new Error("JWT_SECRET is not configured");
    error.status = 500;
    throw error;
  }

  return secret;
}

export function signAccessToken(payload, options = {}) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: options.expiresIn || DEFAULT_ACCESS_TTL,
  });
}

export function signRefreshToken(payload, options = {}) {
  return jwt.sign(payload, getJwtSecret(), {
    expiresIn: options.expiresIn || DEFAULT_REFRESH_TTL,
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, getJwtSecret());
}

export function isTokenExpiredError(error) {
  return error?.name === "TokenExpiredError";
}

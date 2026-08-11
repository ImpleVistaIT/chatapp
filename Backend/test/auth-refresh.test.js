import test from "node:test";
import assert from "node:assert/strict";

import { requireAuth } from "../src/middleware/requireAuth.js";
import { signAccessToken, signRefreshToken, verifyAccessToken } from "../src/services/auth/jwt.service.js";

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    setHeader(name, value) {
      this.headers[String(name).toLowerCase()] = value;
    },
  };
}

function mockRequest({ accessToken = null, refreshToken = null } = {}) {
  const headers = {};

  if (accessToken) {
    headers.authorization = `Bearer ${accessToken}`;
  }

  return {
    headers,
    cookies: refreshToken ? { refreshToken } : {},
    user: null,
  };
}

test("signAccessToken and verifyAccessToken round-trip claims", () => {
  process.env.JWT_SECRET = "test-secret";

  const token = signAccessToken({ id: "user-1", username: "user-1" });
  const claims = verifyAccessToken(token);

  assert.equal(claims.id, "user-1");
  assert.equal(claims.username, "user-1");
});

test("requireAuth allows a valid access token without refreshing", async () => {
  process.env.JWT_SECRET = "test-secret";

  const req = mockRequest({
    accessToken: signAccessToken({ id: "user-1", username: "user-1" }),
    refreshToken: signRefreshToken({ id: "user-1", username: "user-1", type: "refresh" }),
  });
  const res = createRes();

  let called = false;
  await requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["x-access-token"], undefined);
  assert.equal(req.user?.id, "user-1");
});

test("requireAuth refreshes an expired access token and continues the request", async () => {
  process.env.JWT_SECRET = "test-secret";

  const expiredAccessToken = signAccessToken({ id: "user-2", username: "user-2" }, { expiresIn: "1ms" });
  const refreshToken = signRefreshToken({ id: "user-2", username: "user-2", type: "refresh" });

  await new Promise((resolve) => setTimeout(resolve, 5));

  const req = mockRequest({ accessToken: expiredAccessToken, refreshToken });
  const res = createRes();

  let called = false;
  await requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, true);
  assert.equal(res.statusCode, 200);
  assert.match(String(res.headers["x-access-token"] || ""), /^[^.]+\.[^.]+\.[^.]+$/);
  assert.equal(res.headers["x-auth-refreshed"], "1");
  assert.equal(req.user?.id, "user-2");
});

test("requireAuth rejects a tampered access token without refreshing", async () => {
  process.env.JWT_SECRET = "test-secret";

  const validAccessToken = signAccessToken({ id: "user-3", username: "user-3" });
  const tamperedAccessToken = `${validAccessToken}x`;
  const req = mockRequest({
    accessToken: tamperedAccessToken,
    refreshToken: signRefreshToken({ id: "user-3", username: "user-3", type: "refresh" }),
  });
  const res = createRes();

  let called = false;
  await requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, "Authentication failed");
  assert.equal(res.body?.code, "AUTH_INVALID");
});

test("requireAuth rejects an invalid refresh token when the access token is expired", async () => {
  process.env.JWT_SECRET = "test-secret";

  const expiredAccessToken = signAccessToken({ id: "user-4", username: "user-4" }, { expiresIn: "1ms" });

  await new Promise((resolve) => setTimeout(resolve, 5));

  const req = mockRequest({
    accessToken: expiredAccessToken,
    refreshToken: `${signRefreshToken({ id: "user-4", username: "user-4", type: "refresh" })}x`,
  });
  const res = createRes();

  let called = false;
  await requireAuth(req, res, () => {
    called = true;
  });

  assert.equal(called, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body?.error, "Your session has expired. Please login again.");
  assert.equal(res.body?.code, "TOKEN_EXPIRED");
});

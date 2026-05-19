import jwt from "jsonwebtoken";
import { fileURLToPath } from "url";
import path from "path";

const __filename = fileURLToPath(import.meta.url);

export function requireAuth(req, res, next) {
  // console.log("🔥 requireAuth LOADED FROM:", __filename);

  // console.log("==== AUTH DEBUG ====");
  // console.log("authorization header:", req.headers.authorization);
  // console.log("====================");

  const auth = req.headers.authorization;

  if (!auth) {
    return res.status(401).json({
      ok: false,
      error: "Missing Authorization header"
    });
  }

  if (!auth.startsWith("Bearer ")) {
    return res.status(401).json({
      ok: false,
      error: "Invalid Authorization format (must be Bearer token)"
    });
  }

  const token = auth.split(" ")[1]?.trim();

  if (!token) {
    return res.status(401).json({
      ok: false,
      error: "Token missing after Bearer"
    });
  }

  const secret = process.env.JWT_SECRET;

  if (!secret) {
    return res.status(500).json({
      ok: false,
      error: "JWT_SECRET is not configured"
    });
  }

  try {
    const claims = jwt.verify(token, secret);

    // console.log("🔥 DECODED CLAIMS:", claims);

    if (!claims?.id) {
      return res.status(401).json({
        ok: false,
        error: "Invalid token (missing id)"
      });
    }

    req.user = {
      id: String(claims.id),
      claims
    };

    return next();
  } catch (err) {
    console.log("JWT ERROR:", err.message);

    return res.status(401).json({
      ok: false,
      error: "Invalid token"
    });
  }
}
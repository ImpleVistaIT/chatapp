import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import cookieParser from "cookie-parser";

import { chatRoutes } from "./routes/chat.routes.js";
import { sapRoutes } from "./routes/sap.routes.js";
import { poExtractRoutes } from "./routes/poextract.routes.js";
import solmanRoutes from "./routes/solman.routes.js";
import { handleChatStream } from "./controllers/chat.stream.controller.js";

import { errorHandler } from "./middleware/errorHandler.js";
import { requireAuth } from "./middleware/requireAuth.js";

export const app = express();

// --------------------
// CORS
// --------------------
app.use(
  cors({
    origin: ["http://localhost:5173"],
    credentials: true,
  })
);

// --------------------
// Cookies
// --------------------
app.use(cookieParser());

// --------------------
// JSON parser
// --------------------
app.use(express.json({ limit: "2mb" }));

// --------------------
// Health check
// --------------------
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "sap-chat", ts: new Date().toISOString() });
});

// --------------------
// DEV LOGIN
// --------------------
if (process.env.NODE_ENV !== "production") {
  app.post("/auth/dev-login", (req, res) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ ok: false, error: "JWT_SECRET is not configured" });
    }

    const username = String(req.body?.username || "dev").trim() || "dev";

    const accessToken = jwt.sign({ id: username, username }, secret, {
      expiresIn: "15m",
    });

    const refreshToken = jwt.sign({ id: username, type: "refresh" }, secret, {
      expiresIn: "30d",
    });

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/auth/refresh",
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    return res.json({ ok: true, accessToken });
  });

  app.post("/auth/refresh", (req, res) => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ ok: false, error: "JWT_SECRET is not configured" });
    }

    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ ok: false, error: "Missing refresh token" });
    }

    try {
      const payload = jwt.verify(token, secret);
      if (payload?.type !== "refresh" || !payload?.id) {
        return res.status(401).json({ ok: false, error: "Invalid refresh token" });
      }

      const accessToken = jwt.sign({ id: payload.id, username: payload.id }, secret, {
        expiresIn: "15m",
      });

      return res.json({ ok: true, accessToken });
    } catch {
      return res.status(401).json({ ok: false, error: "Invalid refresh token" });
    }
  });
}

// --------------------
// ROUTES
// --------------------
app.use("/api/solman", requireAuth, solmanRoutes);
app.use("/sap", requireAuth, sapRoutes);

app.post("/chat/stream", requireAuth, handleChatStream);
app.use("/chat", requireAuth, chatRoutes);
app.use("/po", requireAuth, poExtractRoutes);

// --------------------
// 404 fallback
// --------------------
app.use((req, res) => res.status(404).json({ ok: false, error: "Not found" }));

// --------------------
// Error handler
// --------------------
app.use(errorHandler);
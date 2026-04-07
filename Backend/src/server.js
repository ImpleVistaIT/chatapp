import express from "express";
import cors from "cors";
import dotenv from "dotenv";

import { chatRoutes } from "./routes/chat.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

dotenv.config();

const app = express();

// --- Middleware ---
app.use(
  cors({
    // Allow your Vite dev server origins (local + LAN)
    origin: [
      "http://localhost:5173",
      "http://192.168.1.110:5173",
      // optional: if you access Vite via hostname
      // "http://your-server-hostname:5173",
    ],
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

// --- Health ---
app.get("/health", (req, res) => {
  res.json({ ok: true, service: "sap-chat", ts: new Date().toISOString() });
});

// --- Chat endpoint ---
app.use("/chat", chatRoutes);

// --- 404 ---
app.use((req, res) => {
  res.status(404).json({ ok: false, error: "Not found" });
});

// --- Error handler ---
app.use(errorHandler);

const port = Number(process.env.PORT || 3000);

// IMPORTANT: listen on all interfaces so other machines can reach it via 192.168.1.110
const host = process.env.HOST || "0.0.0.0";

app.listen(port, host, () => {
  console.log(`✅ SAP Chat backend running at http://${host}:${port}`);
  console.log(`✅ Health check: http://192.168.1.110:${port}/health`);
});
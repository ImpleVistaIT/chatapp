import express from "express";
import { chatRoutes } from "./routes/chat.routes.js";
import { errorHandler } from "./middleware/errorHandler.js";

export const app = express();

app.use(express.json({ limit: "1mb" }));

app.get("/health", (req, res) => res.json({ ok: true }));

app.use("/chat", chatRoutes);

app.use(errorHandler);
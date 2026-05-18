import express from "express";

import { handleChatEntry } from "../controllers/chat.entry.controller.js";
import { submitSolmanCreateChangeRequest } from "../controllers/chat.actions.controller.js";

import {
  listChatSessions,
  listChatMessages,
  renameChatSession,
  deleteChatSession,
} from "../controllers/chat.controller.js";

export const chatRoutes = express.Router();

// main chat API (router-aware)
chatRoutes.post("/", handleChatEntry);

// action endpoints
chatRoutes.post("/actions/solman/create-change-request", submitSolmanCreateChangeRequest);

// sidebar sessions
chatRoutes.get("/sessions", listChatSessions);

// chat messages
chatRoutes.get("/sessions/:sessionId/messages", listChatMessages);

// rename session
chatRoutes.patch("/sessions/:sessionId", renameChatSession);

// delete session
chatRoutes.delete("/sessions/:sessionId", deleteChatSession);
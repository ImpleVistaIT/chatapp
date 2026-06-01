import express from "express";

import { handleChatEntry } from "../controllers/chat.entry.controller.js";
import {
  submitSolmanCreateChangeRequest,
  getSolmanChangeRequestDetails,
  listSolmanChangeRequests,
} from "../controllers/chat.actions.controller.js";

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
chatRoutes.post(
  "/actions/solman/create-change-request",
  submitSolmanCreateChangeRequest
);

chatRoutes.post(
  "/actions/solman/get-change-request-details",
  getSolmanChangeRequestDetails
);

chatRoutes.post(
  "/actions/solman/list-change-requests",
  listSolmanChangeRequests
);

// sidebar sessions
chatRoutes.get("/sessions", listChatSessions);

// chat messages
chatRoutes.get("/sessions/:sessionId/messages", listChatMessages);

// rename session
chatRoutes.patch("/sessions/:sessionId", renameChatSession);

// delete session
chatRoutes.delete("/sessions/:sessionId", deleteChatSession);
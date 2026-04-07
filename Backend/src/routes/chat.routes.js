import { Router } from "express";
import { chatController } from "../controllers/chat.controller.js";

export const chatRoutes = Router();

// POST /chat  -> { message: "..." }
chatRoutes.post("/", chatController);
import { getOwner } from "./_chat/auth.js";
import { orchestrateChatRequest } from "../services/routing/chatOrchestrator.service.js";
import { getConversationRoutingContext } from "../services/routing/conversationContext.service.js";

export async function handleChatEntry(req, res, next) {
  try {
    const owner = getOwner(req);
    const { query, sessionId } = req.body || {};

    if (!String(query || "").trim()) {
      return res.status(400).json({
        ok: false,
        error: "query is required",
      });
    }

    const sessionContext = await getConversationRoutingContext({
      owner,
      sessionId,
    });

    const response = await orchestrateChatRequest({
      query: String(query).trim(),
      sessionContext,
      req,
    });

    return res.status(200).json(response);
  } catch (e) {
    return next(e);
  }
}
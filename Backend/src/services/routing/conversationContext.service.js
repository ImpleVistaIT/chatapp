import mongoose from "mongoose";
import { ChatSession } from "../../models/ChatSession.model.js";
import { ChatMessage } from "../../models/ChatMessage.model.js";

export async function getConversationRoutingContext({ owner, sessionId }) {
  if (!sessionId || !mongoose.Types.ObjectId.isValid(sessionId)) {
    return {
      session: null,
      recentMessages: [],
      inferredSystem: null,
    };
  }

  const session = await ChatSession.findOne({ _id: sessionId, owner }).lean();
  if (!session) {
    return {
      session: null,
      recentMessages: [],
      inferredSystem: null,
    };
  }

  const recentMessages = await ChatMessage.find({ sessionId: session._id, owner })
    .sort({ createdAt: -1 })
    .limit(6)
    .lean();

  return {
    session,
    recentMessages: recentMessages.reverse(),
    inferredSystem: session.currentSystemType || null,
  };
}
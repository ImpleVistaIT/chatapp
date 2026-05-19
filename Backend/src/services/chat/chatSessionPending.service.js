import { ChatSession } from "../../models/ChatSession.model.js";

export async function setSessionPendingAction(sessionId, pendingAction) {
  if (!sessionId) return null;

  return ChatSession.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        pendingAction,
      },
    },
    { new: true }
  );
}

export async function clearSessionPendingAction(sessionId) {
  if (!sessionId) return null;

  return ChatSession.findByIdAndUpdate(
    sessionId,
    {
      $set: {
        pendingAction: null,
      },
    },
    { new: true }
  );
}

export async function getSessionPendingAction(sessionId) {
  if (!sessionId) return null;

  const session = await ChatSession.findById(sessionId).lean();
  return session?.pendingAction || null;
}
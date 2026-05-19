import mongoose from "mongoose";
import { ChatSession } from "../../models/ChatSession.model.js";
import { normalizeSystemId, normalizeSapUser } from "./auth.js";

// ---- Chat session helpers ----
export async function getOrCreateSession({ owner, sessionId, systemId, sapUser }) {
  const sid = normalizeSystemId(systemId);
  if (!sid) {
    const e = new Error("systemId is required");
    e.status = 400;
    throw e;
  }

  const su = normalizeSapUser(sapUser);

  if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
    const q = { _id: sessionId, owner, systemId: sid };
    if (su) q.sapUser = su;

    const existing = await ChatSession.findOne(q);
    if (existing) return existing;
  }

  const created = await ChatSession.create({
    owner,
    systemId: sid,
    sapUser: su,
    title: "",
    sapConnectionId: null,
    updatedAt: new Date(),
  });
  return created;
}
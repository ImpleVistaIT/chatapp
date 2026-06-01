import mongoose from "mongoose";
import { getOwner } from "./_chat/auth.js";
import { orchestrateChatRequest } from "../services/routing/chatOrchestrator.service.js";
import { getConversationRoutingContext } from "../services/routing/conversationContext.service.js";
import { ChatSession } from "../models/ChatSession.model.js";
import { ChatMessage } from "../models/ChatMessage.model.js";

function normalizeSystemId(systemId) {
  return String(systemId || "").trim().toUpperCase();
}

function normalizeSapUser(sapUser) {
  const s = String(sapUser || "").trim();
  return s ? s : null;
}

async function getOrCreateSession({ owner, sessionId, systemId, sapUser }) {
  const sid = normalizeSystemId(systemId);
  const su = normalizeSapUser(sapUser);

  if (!sid) {
    const err = new Error("systemId is required");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  if (sessionId && mongoose.Types.ObjectId.isValid(sessionId)) {
    const q = { _id: sessionId, owner, systemId: sid };
    if (su) q.sapUser = su;

    const existing = await ChatSession.findOne(q);
    if (existing) return existing;
  }

  return ChatSession.create({
    owner,
    systemId: sid,
    sapUser: su,
    title: "",
    sapConnectionId: null,
    updatedAt: new Date(),
  });
}

function buildAssistantTextFromResponse(response) {
  const actionType = response?.action?.type || "";
  const executor = response?.action?.executor || "";
  const result = response?.result || {};
  const rows = Array.isArray(result?.results) ? result.results : [];

  if (response?.status === "disconnected_system") {
    return response?.message || "The requested system is disconnected.";
  }

  if (response?.status === "needs_input") {
    return response?.message || "More information is required to continue.";
  }

  if (actionType === "confirm") {
    if (executor === "solman.charm.getChangeRequestDetails") {
      const item = rows[0];

      if (!item) {
        return response?.message || "No details found.";
      }

      return (
        `CR ${item.OBJECT_ID}\n` +
        `Short Description: ${item.SHORT_DESC || "-"}\n` +
        `Status: ${item.STATUS || "-"}\n` +
        `Priority: ${item.PRIORITY || "-"}\n` +
        `Created On: ${item.CREATED_ON || "-"}\n` +
        `Last Changed By: ${item.LAST_CHANGED_BY || "-"}\n` +
        `Last Changed At: ${item.LAST_CHANGED_AT || "-"}\n` +
        `Category: ${item.CATEGORY || "-"}`
      );
    }

    if (executor === "solman.charm.listChangeRequests") {
      if (!rows.length) {
        return response?.message || "No change requests found.";
      }

      const lines = rows.map((item, index) => {
        return (
          `${index + 1}. CR ${item.OBJECT_ID}\n` +
          `   Short Description: ${item.SHORT_DESC || "-"}\n` +
          `   Status: ${item.STATUS || "-"}\n` +
          `   Priority: ${item.PRIORITY || "-"}\n` +
          `   Created On: ${item.CREATED_ON || "-"}`
        );
      });

      return `Found ${rows.length} change request(s):\n\n${lines.join("\n\n")}`;
    }
  }

  return response?.message || "Request completed.";
}

export async function handleChatEntry(req, res, next) {
  try {
    const owner = getOwner(req);
    const { query, sessionId, systemId, sapUser, availableSystems } = req.body || {};
    const trimmedQuery = String(query || "").trim();

    if (!trimmedQuery) {
      return res.status(400).json({
        ok: false,
        error: "query is required",
      });
    }

    const hasExplicitSystemId = Boolean(String(systemId || "").trim());
    const hasAvailableSystems =
      Array.isArray(availableSystems) && availableSystems.length > 0;

    if (!hasExplicitSystemId && !hasAvailableSystems) {
      return res.status(400).json({
        ok: false,
        error: "Either systemId or availableSystems is required",
      });
    }

    let session = null;
    let sessionContext = null;

    if (hasExplicitSystemId) {
      session = await getOrCreateSession({
        owner,
        sessionId,
        systemId,
        sapUser,
      });

      await ChatMessage.create({
        owner,
        sessionId: session._id,
        role: "user",
        text: trimmedQuery,
      });

      if (!session.title) {
        await ChatSession.updateOne(
          { _id: session._id },
          {
            $set: {
              title: trimmedQuery.slice(0, 80),
              updatedAt: new Date(),
            },
          }
        );
      }

      sessionContext = await getConversationRoutingContext({
        owner,
        sessionId: String(session._id),
      });
    }

    const response = await orchestrateChatRequest({
      query: trimmedQuery,
      sessionContext,
      req,
    });

    const resolvedSystemId = String(
      response?.systemResolution?.targetSystemId || req?.body?.systemId || ""
    ).trim();

    if (!session && resolvedSystemId) {
      session = await getOrCreateSession({
        owner,
        sessionId,
        systemId: resolvedSystemId,
        sapUser,
      });

      await ChatMessage.create({
        owner,
        sessionId: session._id,
        role: "user",
        text: trimmedQuery,
      });

      if (!session.title) {
        await ChatSession.updateOne(
          { _id: session._id },
          {
            $set: {
              title: trimmedQuery.slice(0, 80),
              updatedAt: new Date(),
            },
          }
        );
      }
    }

    if (session) {
      await ChatMessage.create({
        owner,
        sessionId: session._id,
        role: "assistant",
        text: buildAssistantTextFromResponse(response),
        extracted: response?.routing || null,
        responseMeta: {
          ok: response?.ok === true,
          status: response?.status || null,
          action: response?.action || null,
          systemResolution: response?.systemResolution || null,
        },
        data: response?.result || null,
      });

      await ChatSession.updateOne(
        { _id: session._id },
        { $set: { updatedAt: new Date() } }
      );
    }

    return res.status(200).json({
      ...response,
      sessionId: session ? String(session._id) : null,
    });
  } catch (e) {
    return next(e);
  }
}
import { ROUTING_CONFIG } from "../../config/routing.config.js";
import { getConversationRoutingContext } from "./conversationContext.service.js";
import { classifyPrompt } from "./promptClassifier.service.js";

function isFollowUpLike(query) {
  const q = String(query || "").trim().toLowerCase();

  if (!q) return false;

  const phrases = [
    "next",
    "more",
    "show more",
    "details",
    "show details",
    "what about",
    "and status",
    "same",
    "continue",
    "show item",
    "open item",
    "line item",
    "item ",
  ];

  if (phrases.some((x) => q === x || q.includes(x))) {
    return true;
  }

  if (/\bitem\s*0*\d{1,6}\b/i.test(q)) return true;
  if (/\bline\s*item\s*0*\d{1,6}\b/i.test(q)) return true;

  return false;
}
export async function resolveTargetSystem({ owner, sessionId, query }) {
  const sessionContext = ROUTING_CONFIG.followUp.enableConversationMemory
    ? await getConversationRoutingContext({ owner, sessionId })
    : { session: null, recentMessages: [], inferredSystem: null };

  const classification = await classifyPrompt({
    query,
    sessionContext,
  });

  if (classification.system === "ambiguous" && isFollowUpLike(query)) {
    if (sessionContext?.inferredSystem) {
      return {
        targetSystem: sessionContext.inferredSystem,
        confidence: 0.68,
        reason: "Ambiguous follow-up routed from session memory",
        source: "session-memory",
        sessionContext,
        classification,
      };
    }

    return {
      targetSystem: ROUTING_CONFIG.defaultSystem,
      confidence: 0.51,
      reason: "Ambiguous follow-up routed to default system",
      source: "fallback-followup",
      sessionContext,
      classification,
    };
  }

  if (classification.system === "ambiguous") {
    return {
      targetSystem: null,
      confidence: classification.confidence,
      reason: classification.reason,
      source: classification.source,
      sessionContext,
      classification,
    };
  }

  return {
    targetSystem: classification.system,
    confidence: classification.confidence,
    reason: classification.reason,
    source: classification.source,
    sessionContext,
    classification,
  };
}
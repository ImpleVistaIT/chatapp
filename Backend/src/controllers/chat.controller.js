import { entityRouterService } from "../services/entityRouter.service.js";
import { routeMessage } from "../llm/llm.router.js";
 
function isGreeting(message) {
  const m = String(message || "").trim().toLowerCase();
  return ["hi", "hello", "hey", "hii", "hai", "help", "start"].includes(m);
}
 
// ------------------- Simple in-memory pagination store -------------------
const listStateBySession = new Map();
 
function getSessionKey(req) {
  const user = String(req.body?.user || "").trim();
  if (user) return `user:${user}`;
  return `ip:${req.ip}`;
}
 
function parseNextRequest(message) {
  const m = String(message || "").trim().toLowerCase();
 
  const isNext =
    /\b(next|more)\b/.test(m) ||
    /\bshow\s+next\b/.test(m) ||
    /\bshow\s+more\b/.test(m);
 
  if (!isNext) return null;
 
  const n = m.match(/\b(next|more)\s+(\d+)\b/);
  const take = n ? Number(n[2]) : 10;
  if (!Number.isFinite(take) || take <= 0) return null;
 
  return { take };
}
 
export async function chatController(req, res, next) {
  try {
    const message = String(req.body?.message || "").trim();
 
    if (!message) {
      return res.status(400).json({
        ok: false,
        reply: "Message is required",
        error: "Message is required",
      });
    }
 
    // ✅ GREETING
    if (isGreeting(message)) {
      return res.json({
        ok: true,
        reply: "Hi, Welcome to ImpleVista AI. How may I assist you?",
        suggestions: [
          "Show latest purchase orders",
          "Show PO created in January 2026",
          "Show details of PO 4500001933",
        ],
      });
    }
 
    const sessionKey = getSessionKey(req);
 
    // ✅ HANDLE NEXT / MORE
    const nextReq = parseNextRequest(message);
    if (nextReq) {
      const state = listStateBySession.get(sessionKey);
 
      if (!state || state.entity !== "PO" || state.intent !== "SHOW_PO") {
        return res.status(400).json({
          ok: false,
          message,
          reply:
            "No previous PO list found. First run something like: 'show po in the year of 2019', then say 'next 10'.",
          error: "NO_PREVIOUS_LIST",
        });
      }
 
      const routed = {
        entity: state.entity,
        intent: state.intent,
        id: null,
        filters: {
          ...(state.filters || null),
          skip: state.skip + (state.take || 0),
          limit: nextReq.take,
        },
      };
 
      const result = await entityRouterService.handle(routed);
 
      listStateBySession.set(sessionKey, {
        entity: "PO",
        intent: "SHOW_PO",
        filters: state.filters || null,
        skip: routed.filters.skip,
        take: nextReq.take,
        updatedAt: Date.now(),
      });
 
      return res.json({
        ok: true,
        message,
        routed,
        ...result,
      });
    }
 
    // 🔥 GIBBERISH DETECTION (BEFORE ROUTING)
    const userText = message.toLowerCase().trim();
 
    const hasPONumber = /\b\d{8,12}\b/.test(userText);
 
    const hasMeaningfulKeyword =
      /\b(po|purchase order|vendor|created|details|plant|storage|items|list|show)\b/.test(
        userText
      );
 
    const isGibberish = !hasMeaningfulKeyword && !hasPONumber;
 
    // 🚫 BLOCK GIBBERISH
    if (isGibberish) {
      return res.json({
        ok: true,
        reply: "Hi, Welcome to ImpleVista AI. How may I assist you?",
        suggestions: [
          "Show latest purchase orders",
          "Show PO created in January 2026",
          "Show details of PO 4500001933",
        ],
      });
    }
 
    // ✅ NORMAL ROUTING
    const routed = await routeMessage({ message });
    // 🚫 STOP UNKNOWN INTENT (VERY IMPORTANT)
    if (routed?.intent === "UNKNOWN") {
      return res.json({
        ok: true,
        reply: "Hi, Welcome to ImpleVista AI. How may I assist you?",
        suggestions: [
          "Show latest purchase orders",
          "Show PO created in January 2026",
          "Show details of PO 4500001933",
        ],
      });
    }
 
    // ✅ Pagination defaults
    if (routed?.entity === "PO" && routed?.intent === "SHOW_PO") {
      routed.filters = routed.filters || null;
 
      const take = Number(routed.filters?.limit || 10);
      const skip = Number(routed.filters?.skip || 0);
 
      routed.filters = {
        ...(routed.filters || {}),
        limit: Number.isFinite(take) ? take : 10,
        skip: Number.isFinite(skip) ? skip : 0,
      };
    }
 
    const result = await entityRouterService.handle(routed);
 
    // ✅ Save list state
    if (routed?.entity === "PO" && routed?.intent === "SHOW_PO") {
      const { skip, limit, ...baseFilters } = routed.filters || {};
 
      listStateBySession.set(sessionKey, {
        entity: "PO",
        intent: "SHOW_PO",
        filters: Object.keys(baseFilters).length ? baseFilters : null,
        skip: Number(skip || 0),
        take: Number(limit || 10),
        updatedAt: Date.now(),
      });
    }
 
    return res.json({
      ok: true,
      message,
      routed,
      ...result,
    });
  } catch (err) {
    next(err);
  }
}
 
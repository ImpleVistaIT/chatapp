export const ROUTING_CONFIG = {
  defaultSystem: "s4hana",

  confidence: {
    low: Number(process.env.ROUTER_CONFIDENCE_LOW || 0.35),
    high: Number(process.env.ROUTER_CONFIDENCE_HIGH || 0.8),
    medium: Number(process.env.ROUTER_CONFIDENCE_MEDIUM || 0.6),
  },

  followUp: {
    enableConversationMemory:
      String(process.env.ROUTER_ENABLE_CONVERSATION_MEMORY || "true").toLowerCase() === "true",
  },

  systems: {
    s4hana: {
      enabled: String(process.env.ROUTER_ENABLE_S4HANA || "true").toLowerCase() === "true",
    },
    solman: {
      enabled: String(process.env.ROUTER_ENABLE_SOLMAN || "true").toLowerCase() === "true",
    },
  },
};
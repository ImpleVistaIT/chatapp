export function buildSystemContextResolverPrompt({
  query,
  classified = null,
  availableSystems = [],
}) {
  const safeQuery = String(query || "").trim();

  const safeClassified =
    classified && typeof classified === "object"
      ? {
          system: classified.system || "unknown",
          module: classified.module || "unknown",
          intent: classified.intent || "unknown",
        }
      : {
          system: "unknown",
          module: "unknown",
          intent: "unknown",
        };

  const systems = Array.isArray(availableSystems)
    ? availableSystems
        .map((s) => ({
          systemId: String(s?.systemId || "").trim(),
          name: String(s?.name || s?.systemId || "").trim(),
          connected: Boolean(s?.connected),
          aliases: Array.isArray(s?.aliases)
            ? s.aliases.map((a) => String(a || "").trim()).filter(Boolean)
            : [],
        }))
        .filter((s) => s.systemId)
    : [];

  return `
You are a system-target resolver for an SAP chatbot.

Your task:
Given a user query, a classified business intent, and a list of available systems,
identify which exact system the user most likely means.

Important decision rules:
1. The available systems list is the source of truth. Never invent systems.
2. Prefer explicit mentions in the query:
   - exact systemId
   - system name
   - alias
   - close short-form reference
3. If the query clearly matches exactly one system:
   - return "resolved" if that system is connected
   - return "disconnected" if that system is not connected
4. If the query plausibly matches multiple connected systems and you cannot confidently choose one, return "ambiguous".
5. If no system can reasonably be inferred from the query or context, return "unknown".
6. Use the classified intent only as supporting context, never as a reason to invent or guess a system.
7. For "ambiguous" and "unknown", set "targetSystemId" to null.
8. For "resolved" and "disconnected", "targetSystemId" must be one of the provided systemIds.
9. In "candidates", include only systemIds from the provided list.
10. Keep "reason" short and concrete.

Return strict JSON only with this exact shape:
{
  "status": "resolved" | "ambiguous" | "disconnected" | "unknown",
  "targetSystemId": "string or null",
  "confidence": 0.0,
  "reason": "short explanation",
  "candidates": ["systemId1", "systemId2"]
}

Examples:
- One exact connected match -> status "resolved"
- One exact disconnected match -> status "disconnected"
- Two plausible connected matches -> status "ambiguous"
- No clear match -> status "unknown"

User query:
${JSON.stringify(safeQuery)}

Classified intent:
${JSON.stringify(safeClassified, null, 2)}

Available systems:
${JSON.stringify(systems, null, 2)}
`.trim();
}
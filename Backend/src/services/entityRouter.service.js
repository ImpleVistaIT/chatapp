import { ApiError } from "../utils/errors.js";
import { entityRegistry } from "../config/entities.registry.js";
import { resolveIntentPaths } from "../extractors/intentFieldResolver.js";
import { pickPaths } from "../extractors/fieldExtractor.js";
import { formatOneLine } from "../formatters/oneLine.formatter.js";
import { formatList } from "../formatters/list.formatter.js";

export const entityRouterService = {
  async handle({ entity, intent, id, filters }) {
    const e = String(entity || "").toUpperCase();
    const i = String(intent || "").toUpperCase();

    const entry = entityRegistry[e];
    if (!entry) throw new ApiError(400, `Unsupported entity: ${entity}`);

    const intentDef = entry.intents[i];
    if (!intentDef)
      throw new ApiError(
        400,
        `Unsupported intent "${intent}" for entity "${entity}".`
      );

    // LIST mode does not require id
    const requiresId =
      typeof intentDef.requiresId === "boolean"
        ? intentDef.requiresId
        : intentDef.mode !== "LIST"; // default: LIST=false, others=true

    if (requiresId && !id) {
      throw new ApiError(
        400,
        `id is required for intent "${intent}" (entity "${entity}").`
      );
    }

    // Fetch raw XML (pass filters down)
    const xml = await entry.service.fetch({ id, intent: i, filters });

    // Transform to structured JSON (pass filters down)
    const structured = await entry.transformer.transform({
      xml,
      id,
      intent: i,
      filters,
    });

    // Extract only when needed
    let data = null;
    if (intentDef.mode === "FIELD") {
      const paths = resolveIntentPaths(intentDef);
      data = pickPaths(structured, paths);
    }

    // ✅ LIST → table/list
    if (intentDef.mode === "LIST") {
      return {
        entity: e,
        intent: i,
        filters: filters || null,
        data: formatList({ entity: e, intent: i, structured }),
        // optional, but helps UI: provide a readable reply
        reply: formatOneLine({
          entity: e,
          intent: i,
          id,
          data: structured,
          intentDef,
        }),
      };
    }

    // ✅ FIELD → one-line answer
    if (intentDef.mode === "FIELD") {
      return {
        entity: e,
        intent: i,
        filters: filters || null,
        data,
        reply: formatOneLine({ entity: e, intent: i, id, data, intentDef }),
      };
    }

    // ✅ DETAIL → full structured response
    // Only include "reply" if a template exists for this intent.
    if (intentDef.mode === "DETAIL") {
      const hasTemplate = typeof intentDef.template === "function";

      return {
        entity: e,
        intent: i,
        filters: filters || null,
        data: structured,
        ...(hasTemplate
          ? {
              reply: formatOneLine({
                entity: e,
                intent: i,
                id,
                data: structured,
                intentDef,
              }),
            }
          : {}),
      };
    }

    // fallback
    return {
      entity: e,
      intent: i,
      filters: filters || null,
      data,
      reply: formatOneLine({ entity: e, intent: i, id, data, intentDef }),
    };
  },
};
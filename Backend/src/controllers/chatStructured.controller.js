import { ApiError } from "../utils/errors.js";
import { entityRouterService } from "../services/entityRouter.service.js";

export async function chatStructuredController(req, res, next) {
  try {
    const { entity, intent, id } = req.body || {};

    if (!entity || !intent) {
      throw new ApiError(400, "entity and intent are required.");
    }

    const result = await entityRouterService.handle({ entity, intent, id });
    return res.json({ ok: true, ...result });
  } catch (err) {
    next(err);
  }
}
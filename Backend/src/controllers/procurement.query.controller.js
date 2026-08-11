import { getOwner } from "./_chat/auth.js";
import { executeProcurementQuery } from "../services/procurement/procurementQueryEngine.service.js";

export async function procurementQueryController(req, res, next) {
  try {
    const owner = getOwner(req);
    const query = String(req.body?.query || req.body?.question || "").trim();
    const systemId = String(req.body?.systemId || req.userContext?.systemId || "").trim();
    const sapUser = String(req.body?.sapUser || req.userContext?.sapUser || "").trim();

    const result = await executeProcurementQuery({
      owner,
      query,
      systemId,
      sapUser,
    });

    return res.json({ ok: true, ...result });
  } catch (error) {
    return next(error);
  }
}

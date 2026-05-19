import { getAllowedFieldsWithLabels } from "../services/allowlist.service.js";
import { extractPoQuery } from "../services/extractor/extractor.service.js";
export async function poExtractController(req, res, next) {
  try {
    const message = String(req.body?.message || "").trim();

    const { fields: allowedFields } = await getAllowedFieldsWithLabels();

    const extracted = await extractPoFields({
      message,
      allowedFields,
    });

    return res.json({ ok: true, ...extracted });

  } catch (e) {
    console.error("Controller error:", e);

    // ✅ IMPORTANT FIX
    if (typeof next === "function") return next(e);

    return res.status(500).json({
      ok: false,
      error: "Internal server error",
    });
  }
}
import { Router } from "express";
import { requireAuth } from "../middleware/requireAuth.js";
import { getOwner, normalizeSapUser, normalizeSystemId } from "../controllers/_chat/auth.js";
import { SapSystem } from "../models/SapSystem.model.js";
import { getSapAuthOrThrow } from "../controllers/_chat/sapAuth.js";
import { releaseTransportRequest } from "../services/systems/solman/transportRelease.service.js";
import { persistAssistantAndTouchSession } from "../controllers/stream/solman/solman.shared.js";

const router = Router();

function cleanString(value = "") {
  return String(value || "").trim();
}

router.post("/release-transport", requireAuth, async (req, res) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.body?.systemId);
    const sapUser = normalizeSapUser(req.body?.sapUser);

    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    if (!sapUser) {
      return res.status(400).json({ ok: false, error: "sapUser is required" });
    }

    const transportNumber = cleanString(req.body?.transportNumber || req.body?.IvObjectId).toUpperCase();
    const quality = Boolean(req.body?.quality ?? req.body?.IvQuality);

    if (!transportNumber) {
      return res.status(400).json({ ok: false, error: "transportNumber is required" });
    }

    if (transportNumber.length > 10) {
      return res.status(400).json({ ok: false, error: "transportNumber must be at most 10 characters" });
    }

    const sapAuth = await getSapAuthOrThrow({ owner, systemId, sapUser });

    const system = await SapSystem.findOne({
      owner: { $in: [owner, "local"] },
      systemId,
    }).lean();

    if (!system) {
      return res.status(400).json({ ok: false, error: `SAP system profile not found for systemId=${systemId}` });
    }

    const result = await releaseTransportRequest({
      system,
      sapAuth,
      payload: {
        IvObjectId: transportNumber,
        IvQuality: quality,
      },
    });

    const sessionId = cleanString(req.body?.sessionId);
    if (/^[a-f0-9]{24}$/i.test(sessionId)) {
      const reply = result.ok
        ? [
            "✅ Transport released successfully.",
            "",
            `Transport Number : ${transportNumber}`,
            result.warning ? "Status : Warning" : null,
            result.message ? `SAP Message : ${result.message}` : null,
          ].filter(Boolean).join("\n")
        : `Transport release failed.\nReason: ${result.message || "Transport release failed."}`;

      await persistAssistantAndTouchSession({
        owner,
        sessionId,
        text: reply,
        summary: reply,
        extracted: {
          system: "solman",
          intent: "release_transport_request",
          transportNumber,
        },
        data: {
          viewType: result.ok ? "solman_release_transport_success" : "solman_release_transport_error",
          transportNumber,
          quality,
          status: result.result?.status || "",
          warning: Boolean(result.warning),
          message: result.message || "",
          messages: Array.isArray(result.result?.messages) ? result.result.messages : [],
          raw: result.result?.raw || null,
        },
        responseMeta: {
          ok: Boolean(result.ok),
          kind: "action",
          executor: "solman.transport.releaseTransport",
          systemId,
          sapUser,
        },
      });
    }

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        success: false,
        message: result.message || "Transport release failed.",
        sap: result.error || null,
        raw: result.result?.raw || null,
      });
    }

    return res.json({
      ok: true,
      success: true,
      message: result.message || "Transport released successfully.",
      transportNumber,
      data: result.result,
    });
  } catch (error) {
    console.error("releaseTransport route error:", error);
    return res.status(error?.status || 500).json({
      ok: false,
      success: false,
      message: error?.message || "Transport release failed.",
      raw: error?.responseData || null,
    });
  }
});

export default router;

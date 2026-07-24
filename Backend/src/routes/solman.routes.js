import { Router } from "express";
import {
  solmanLoginController,
  createChangeRequestController,
  getChangeRequestDetailsController,
} from "../controllers/solman.controller.js";
import { importTransportToProduction } from "../services/systems/solman/importTransportToProduction.service.js";
import { getOwner, normalizeSapUser, normalizeSystemId } from "../controllers/_chat/auth.js";
import { resolveSapConnection } from "../services/sap/sapConnectionResolver.service.js";
import { persistAssistantAndTouchSession } from "../controllers/stream/solman/solman.shared.js";

const router = Router();

router.get("/ping", (req, res) => {
  res.json({ ok: true, message: "solman route works" });
});

router.post("/login", solmanLoginController);
router.post("/change-request/create", createChangeRequestController);
router.get("/change-request/details", getChangeRequestDetailsController);
router.post("/change-request/details", getChangeRequestDetailsController);

router.post("/import-transport-to-production", async (req, res) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.body?.systemId);
    const sapUser = normalizeSapUser(req.body?.sapUser);
    const transportNumber = String(req.body?.transportNumber || req.body?.TransportNumber || req.body?.ObjectId || req.body?.objectId || "").trim().toUpperCase();
    const sessionId = String(req.body?.sessionId || "").trim();

    if (!systemId) return res.status(400).json({ ok: false, error: "systemId is required" });
    if (!sapUser) return res.status(400).json({ ok: false, error: "sapUser is required" });
    if (!transportNumber) return res.status(400).json({ ok: false, error: "transportNumber is required" });

    const connection = await resolveSapConnection({ owner, systemId, sapUser });

    const result = await importTransportToProduction({
      system: connection.system,
      sapAuth: connection.sapAuth,
      payload: { transportNumber, sapUser, systemId },
    });

    const reply = String(result?.message || "").trim();

    if (/^[a-f0-9]{24}$/i.test(sessionId)) {
      await persistAssistantAndTouchSession({
        owner,
        sessionId,
        text: reply,
        summary: reply,
        extracted: {
          system: "solman",
          intent: "import_transport_to_production",
          payload: { transportNumber },
        },
        data: {
          viewType: result?.ok ? "solman_import_transport_to_production_success" : "solman_import_transport_to_production_error",
          ObjectId: result?.objectId || transportNumber,
          Success: result?.status || "",
          TrOutputMsg: result?.outputMessage || "",
          Messages: Array.isArray(result?.messages) ? result.messages : [],
          raw: result?.raw || null,
        },
        responseMeta: {
          ok: Boolean(result?.ok),
          kind: "action",
          executor: "solman.transport.importTransportToProduction",
          systemId,
          sapUser,
        },
      });
    }

    if (!result?.ok) {
      return res.status(400).json({ ok: false, success: false, message: reply || "Failed to import transport to production.", data: result });
    }

    return res.json({
      ok: true,
      success: true,
      message: reply,
      data: {
        ObjectId: result?.objectId || transportNumber,
        Success: result?.status || "",
        TrOutputMsg: result?.outputMessage || "",
        Messages: Array.isArray(result?.messages) ? result.messages : [],
        raw: result?.raw || null,
      },
    });
  } catch (error) {
    console.error("importTransportToProduction route error:", error);
    return res.status(error?.status || 500).json({ ok: false, success: false, message: error?.message || "Failed to import transport to production.", raw: error?.responseData || null });
  }
});

export default router;
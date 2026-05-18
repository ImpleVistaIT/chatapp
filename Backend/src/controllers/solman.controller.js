import { SapSystem } from "../models/SapSystem.model.js";
import { SapCredential } from "../models/SapCredential.model.js";
import { encryptString } from "../utils/crypto.js";
import { getOwner, normalizeSystemId, normalizeSapUser } from "./_chat/auth.js";
import { getSapAuthOrThrow } from "./_chat/sapAuth.js";
import { createSolmanChangeRequest } from "../services/systems/solman/charm.service.js";
import { loginToSolman } from "../services/systems/solman/login.service.js";

function cleanString(v) {
  return String(v || "").trim();
}

function normalizeBaseUrl(v) {
  return cleanString(v).replace(/\/+$/, "");
}

function buildBaseUrl({ baseUrl, protocol, host, port }) {
  const explicitBaseUrl = normalizeBaseUrl(baseUrl);
  if (explicitBaseUrl) return explicitBaseUrl;

  const proto = cleanString(protocol || "https").toLowerCase() === "http" ? "http" : "https";
  const h = cleanString(host);
  const p = cleanString(port);

  if (!h) return "";

  return `${proto}://${h}${p ? `:${p}` : ""}`;
}

function extractConnectionParts(baseUrl) {
  const url = new URL(baseUrl);
  return {
    protocol: url.protocol.replace(":", ""),
    host: url.hostname,
    port: url.port
      ? Number(url.port)
      : url.protocol === "https:"
      ? 443
      : 80,
  };
}

export async function solmanLoginController(req, res) {
  try {
    const owner = getOwner(req);

    const systemId = normalizeSystemId(req.body?.systemId);
    const name = cleanString(req.body?.name) || systemId;
    const sapUser = normalizeSapUser(req.body?.sapUser);
    const sapPassword = cleanString(req.body?.sapPassword);
    const sapRouter = cleanString(req.body?.sapRouter);

    const builtBaseUrl = buildBaseUrl({
      baseUrl: req.body?.baseUrl,
      protocol: req.body?.protocol,
      host: req.body?.host,
      port: req.body?.port,
    });

    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    if (!builtBaseUrl) {
      return res.status(400).json({
        ok: false,
        error: "baseUrl is required, or provide protocol + host + port",
      });
    }

    if (!sapUser) {
      return res.status(400).json({ ok: false, error: "sapUser is required" });
    }

    if (!sapPassword) {
      return res.status(400).json({ ok: false, error: "sapPassword is required" });
    }

    const loginResult = await loginToSolman({
      baseUrl: builtBaseUrl,
      sapUser,
      sapPassword,
    });

    if (!loginResult.ok) {
      return res.status(401).json({
        ok: false,
        error: loginResult.message || "SolMan login failed",
        raw: loginResult.raw,
      });
    }

    const connection = extractConnectionParts(builtBaseUrl);

    const systemDoc = await SapSystem.findOneAndUpdate(
      { owner, systemId },
      {
        $set: {
          owner,
          systemId,
          name,
          baseUrl: builtBaseUrl,
          protocol: connection.protocol,
          host: connection.host,
          port: connection.port,
          sapRouter,
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    ).lean();

    const enc = encryptString(sapPassword);

    await SapCredential.findOneAndUpdate(
      { owner, systemId, sapUser },
      {
        $set: {
          owner,
          systemId,
          sapUser,
          encPassword: enc.enc,
          encIv: enc.iv,
          encTag: enc.tag,
          lastUsedAt: new Date(),
          updatedAt: new Date(),
        },
        $setOnInsert: {
          createdAt: new Date(),
        },
      },
      {
        upsert: true,
        returnDocument: "after",
      }
    );

    return res.json({
      ok: true,
      message: loginResult.message || "Login Successful",
      system: systemDoc,
      sapUser,
      resolvedBaseUrl: builtBaseUrl,
    });
  } catch (e) {
    console.error("solmanLoginController error:", e);

    return res.status(e?.status || 500).json({
      ok: false,
      error: e?.message || "SolMan login failed",
      status: e?.status || 500,
      details: {
        name: e?.name || null,
        code: e?.code || null,
      },
      raw: e?.responseData || null,
    });
  }
}

export async function createChangeRequestController(req, res) {
  try {
    const owner = getOwner(req);

    const systemId = normalizeSystemId(req.body?.systemId);
    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    const sapUser = normalizeSapUser(req.body?.sapUser);
    const payload = req.body?.payload || {};

    const sapAuth = await getSapAuthOrThrow({ owner, systemId, sapUser });

    const system = await SapSystem.findOne({
      owner: { $in: [owner, "local"] },
      systemId,
    }).lean();

    if (!system) {
      return res.status(400).json({
        ok: false,
        error: `SAP system profile not found for systemId=${systemId}`,
      });
    }

    const result = await createSolmanChangeRequest({
      system,
      sapAuth,
      payload,
    });

    if (!result.ok) {
      return res.status(400).json({
        ok: false,
        error: result.message || "Failed to create change request",
        sap: {
          msgType: result.msgType,
          message: result.message,
          changeRequestId: result.changeRequestId,
          status: result.status,
        },
        raw: result.raw,
      });
    }

    return res.json({
      ok: true,
      message: result.message || "Change request created successfully",
      changeRequestId: result.changeRequestId,
      status: result.status,
      sap: {
        msgType: result.msgType,
        message: result.message,
        changeRequestId: result.changeRequestId,
        status: result.status,
      },
      raw: result.raw,
    });
  } catch (e) {
    console.error("createChangeRequestController error:", e);

    return res.status(e?.status || 500).json({
      ok: false,
      error: e?.message || "Failed to create change request",
      status: e?.status || 500,
      details: {
        name: e?.name || null,
        code: e?.code || null,
      },
      raw: e?.responseData || null,
    });
  }
}
import { SapSystem } from "../models/SapSystem.model.js";
import { SapCredential } from "../models/SapCredential.model.js";
import { encryptString } from "../utils/crypto.js";
import { getOwner, normalizeSystemId, normalizeSapUser } from "./_chat/auth.js";
import { getSapAuthOrThrow } from "./_chat/sapAuth.js";
import {
  createSolmanChangeRequest,
  getSolmanChangeRequestDetailsById,
} from "../services/systems/solman/charm.service.js";
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

function toCrDetailsArray(result) {
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result?.result?.results)) return result.result.results;
  if (Array.isArray(result?.data?.results)) return result.data.results;
  if (Array.isArray(result?.raw?.d?.results)) return result.raw.d.results;
  if (Array.isArray(result?.d?.results)) return result.d.results;
  if (result?.raw?.d && !Array.isArray(result.raw.d.results)) return [result.raw.d];
  if (result?.d && !Array.isArray(result.d.results)) return [result.d];
  return [];
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
          msgType: result.result?.msgType,
          message: result.message,
          changeRequestId: result.result?.changeRequestId,
          status: result.result?.status,
        },
        raw: result.result?.raw || null,
      });
    }

    return res.json({
      ok: true,
      message: result.message || "Change request created successfully",
      changeRequestId: result.result?.changeRequestId,
      status: result.result?.status,
      sap: {
        msgType: result.result?.msgType,
        message: result.message,
        changeRequestId: result.result?.changeRequestId,
        status: result.result?.status,
      },
      raw: result.result?.raw || null,
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

export async function getChangeRequestDetailsController(req, res) {
  try {
    const owner = getOwner(req);

    const systemId = normalizeSystemId(req.body?.systemId || req.query?.systemId);
    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    const sapUser = normalizeSapUser(req.body?.sapUser || req.query?.sapUser);

    const objectId = cleanString(
      req.body?.objectId ||
      req.body?.OBJECT_ID ||
      req.query?.objectId ||
      req.query?.OBJECT_ID ||
      req.body?.changeRequestId ||
      req.query?.changeRequestId
    );

    if (!objectId) {
      return res.status(400).json({ ok: false, error: "objectId is required" });
    }

    const processType = cleanString(
      req.body?.processType ||
      req.body?.PROCESS_TYPE ||
      req.query?.processType ||
      req.query?.PROCESS_TYPE
    ) || "YMHF";

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

    const result = await getSolmanChangeRequestDetailsById({
      system,
      sapAuth,
      objectId,
      processType,
    });

    if (result?.ok === false) {
      return res.status(400).json({
        ok: false,
        error: result.message || "Failed to fetch change request details",
        raw: result?.result?.raw || null,
      });
    }

    const rows = toCrDetailsArray(result);
    const item = rows[0] || null;

    if (!item) {
      return res.status(404).json({
        ok: false,
        error: `No details found for change request ${objectId}`,
        objectId,
        processType,
        data: [],
        raw: result?.result?.raw || null,
      });
    }

    return res.json({
      ok: true,
      message: `Fetched details for change request ${objectId}`,
      objectId,
      processType,
      data: rows,
      item,
      raw: result?.result?.raw || null,
    });
  } catch (e) {
    console.error("getChangeRequestDetailsController error:", e);

    return res.status(e?.status || 500).json({
      ok: false,
      error: e?.message || "Failed to fetch change request details",
      status: e?.status || 500,
      details: {
        name: e?.name || null,
        code: e?.code || null,
      },
      raw: e?.responseData || null,
    });
  }
}
import express from "express";
import { SapSystem } from "../models/SapSystem.model.js";
import { SapServiceMap } from "../models/SapServiceMap.model.js";
import { SapCredential } from "../models/SapCredential.model.js";
import { SapConnection } from "../models/SapConnection.model.js";

import { ingestSapCatalog } from "../controllers/sap.catalog.controller.js";

import { encryptString, decryptString } from "../utils/crypto.js";
import { getAllowedFieldsWithLabels } from "../services/allowlist.service.js";
import { fetchFromSap } from "../services/sap.service.js";
import { loginToSolman } from "../services/systems/solman/login.service.js";

export const sapRoutes = express.Router();

function getOwner(req) {
  const owner = String(req.user?.id || "").trim();
  if (!owner) {
    const e = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
  return owner;
}

function normalizeSystemId(systemId) {
  return String(systemId || "").trim().toUpperCase();
}

function normalizeSapUser(value) {
  return String(value || "").trim().toUpperCase();
}

function clampString(value, max = 200) {
  const s = String(value ?? "").trim();
  return s.length > max ? s.slice(0, max) : s;
}

function toInt(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function parseBool(value, defaultValue = true) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === "boolean") return value;

  const s = String(value).trim().toLowerCase();
  if (["true", "1", "yes", "y", "on"].includes(s)) return true;
  if (["false", "0", "no", "n", "off"].includes(s)) return false;

  return defaultValue;
}

function inferSystemKind(system = {}) {
  const name = String(system?.name || "").toLowerCase();
  const host = String(system?.host || "").toLowerCase();

  if (
    name.includes("solman") ||
    name.includes("solution manager") ||
    host.includes("solman") ||
    host.includes("smap")
  ) {
    return "solman";
  }

  return "generic";
}

function sanitizeErrorMessage(err, fallback = "Request failed") {
  const raw = String(err?.message || err || fallback);
  return raw || fallback;
}

function sanitizeResponseData(value) {
  if (value == null) return null;
  const s = String(value);
  return s.length > 4000 ? `${s.slice(0, 4000)}...` : s;
}

function buildClientError(err, { exposeRequestUrl = false } = {}) {
  return {
    ok: false,
    error: sanitizeErrorMessage(err),
    requestUrl: exposeRequestUrl ? err?.requestUrl || null : null,
    responseData: sanitizeResponseData(err?.responseData || null),
  };
}

function buildValidationWarning(err, fallback = "Validation failed") {
  return {
    validated: false,
    warning: sanitizeErrorMessage(err, fallback),
  };
}

async function pickCredential({ owner, systemId, sapUser }) {
  const sid = normalizeSystemId(systemId);
  const su = normalizeSapUser(sapUser || "");

  if (su) {
    return SapCredential.findOne({ owner, systemId: sid, sapUser: su }).lean();
  }

  return SapCredential.findOne({ owner, systemId: sid })
    .sort({ lastUsedAt: -1, updatedAt: -1 })
    .lean();
}

function getDefaultServiceMaps({ owner, systemId }) {
  return [
    {
      owner,
      systemId,
      serviceType: "PO",
      serviceName: process.env.DEFAULT_PO_SERVICE_NAME || "ZMM_PO_DETAILS_SRV",
      entitySet: process.env.DEFAULT_PO_ENTITYSET || "Po_detailsSet",
      entityTypeName: "Po_details",
      idField: "PoNo",
      itemField: "PoItem",
      idPad: 10,
      itemPad: 5,
    },
    {
      owner,
      systemId,
      serviceType: "SO",
      serviceName: process.env.DEFAULT_SO_SERVICE_NAME || "ZSALES_ORDER_DETAILS_SRV",
      entitySet: process.env.DEFAULT_SO_ENTITYSET || "SALES_ORDER_DETAILSSet",
      entityTypeName: "SALES_ORDER_DETAILS",
      idField: "SalesDocument",
      itemField: "SalesItem",
      idPad: 10,
      itemPad: 6,
    },
  ];
}

/* -----------------------------
 * Catalog
 * ----------------------------- */

sapRoutes.post("/catalog/ingest", ingestSapCatalog);

/* -----------------------------
 * Systems
 * ----------------------------- */

// GET /sap/systems
sapRoutes.get("/systems", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const systemsOwner = "local";

    const [systems, creds] = await Promise.all([
      SapSystem.find({ owner: systemsOwner }).sort({ updatedAt: -1 }).lean(),
      SapCredential.find({ owner })
        .select({ systemId: 1, sapUser: 1, updatedAt: 1, lastUsedAt: 1 })
        .lean(),
    ]);

    const bestCredBySid = new Map();

    for (const c of creds) {
      const sid = normalizeSystemId(c.systemId);
      const cur = bestCredBySid.get(sid);

      const cScore = (c.lastUsedAt ? new Date(c.lastUsedAt).getTime() : 0) || 0;
      const cUpd = (c.updatedAt ? new Date(c.updatedAt).getTime() : 0) || 0;

      const curScore = (cur?.lastUsedAt ? new Date(cur.lastUsedAt).getTime() : 0) || 0;
      const curUpd = (cur?.updatedAt ? new Date(cur.updatedAt).getTime() : 0) || 0;

      const better = cScore > curScore || (cScore === curScore && cUpd > curUpd);
      if (!cur || better) {
        bestCredBySid.set(sid, {
          sapUser: c.sapUser,
          updatedAt: c.updatedAt,
          lastUsedAt: c.lastUsedAt,
        });
      }
    }

    return res.json({
      ok: true,
      items: systems.map((s) => {
        const sid = normalizeSystemId(s.systemId);
        const cred = bestCredBySid.get(sid);

        return {
          _id: String(s._id),
          name: s.name || "",
          systemId: sid,
          protocol: s.protocol || "https",
          host: s.host,
          port: s.port,
          sapRouter: s.sapRouter || "",
          createdAt: s.createdAt,
          updatedAt: s.updatedAt,
          hasCredentials: Boolean(cred),
          sapUser: cred?.sapUser || null,
          credentialsUpdatedAt: cred?.updatedAt || null,
          lastUsedAt: cred?.lastUsedAt || null,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

// GET /sap/tiles
sapRoutes.get("/tiles", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const now = new Date();

    const [systems, creds, activeConnections] = await Promise.all([
      SapSystem.find({ owner: { $in: [owner, "local"] } })
        .sort({ updatedAt: -1 })
        .lean(),
      SapCredential.find({ owner })
        .select({
          systemId: 1,
          sapUser: 1,
          updatedAt: 1,
          lastUsedAt: 1,
          createdAt: 1,
          profileFirstName: 1,
          profileLastName: 1,
          profileFullName: 1,
          profileUpdatedAt: 1,
        })
        .sort({ lastUsedAt: -1, updatedAt: -1 })
        .lean(),
      SapConnection.find({
        owner,
        revokedAt: null,
        expiresAt: { $gt: now },
      })
        .select({
          systemId: 1,
          username: 1,
          connectedAt: 1,
          expiresAt: 1,
        })
        .lean(),
    ]);

    const sysBySid = new Map(systems.map((s) => [normalizeSystemId(s.systemId), s]));

    const activeConnectionMap = new Map(
      activeConnections.map((c) => [
        `${normalizeSystemId(c.systemId)}:${normalizeSapUser(c.username)}`,
        c,
      ])
    );

    const items = creds.map((c) => {
      const sid = normalizeSystemId(c.systemId);
      const su = normalizeSapUser(c.sapUser);
      const sys = sysBySid.get(sid);
      const activeConn = activeConnectionMap.get(`${sid}:${su}`);
      const connected = Boolean(activeConn);

      return {
        key: `${sid}:${su}`,
        _id: `${sid}:${su}`,
        systemId: sid,
        name: sys?.name || sid,
        sapUser: su,
        connected,
        isConnected: connected,
        status: connected ? "connected" : "disconnected",
        active: connected,
        connectedAt: activeConn?.connectedAt || null,
        expiresAt: activeConn?.expiresAt || null,
        lastUsedAt: c.lastUsedAt || null,
        credentialsUpdatedAt: c.updatedAt || null,
        credentialsCreatedAt: c.createdAt || null,
        profileFirstName: String(c?.profileFirstName || "").trim(),
        profileLastName: String(c?.profileLastName || "").trim(),
        profileFullName: String(c?.profileFullName || "").trim(),
        profileUpdatedAt: c?.profileUpdatedAt || null,
        system: sys
          ? {
              _id: String(sys._id),
              name: sys.name || "",
              systemId: normalizeSystemId(sys.systemId),
              protocol: sys.protocol || "https",
              host: sys.host || "",
              port: sys.port ?? "",
              sapRouter: sys.sapRouter || "",
              createdAt: sys.createdAt || null,
              updatedAt: sys.updatedAt || null,
            }
          : null,
      };
    });

    return res.json({ ok: true, items });
  } catch (e) {
    next(e);
  }
});

// POST /sap/systems
sapRoutes.post("/systems", async (req, res, next) => {
  try {
    const owner = "local";

    const systemId = normalizeSystemId(req.body?.systemId);
    const name = clampString(req.body?.name || req.body?.description || systemId, 80);

    const protocolRaw = String(req.body?.protocol || "https").toLowerCase();
    const protocol = protocolRaw === "http" ? "http" : "https";

    const host = clampString(
      req.body?.host || req.body?.appServer || req.body?.applicationServer || "",
      200
    );
    const port = toInt(req.body?.port);
    const sapRouter = clampString(req.body?.sapRouter || "", 300);

    if (!systemId || !host || port == null) {
      return res.status(400).json({ ok: false, error: "systemId, host, port are required" });
    }

    if (port <= 0 || port > 65535) {
      return res.status(400).json({ ok: false, error: "port must be 1..65535" });
    }

    const doc = await SapSystem.findOneAndUpdate(
      { owner, systemId },
      {
        $set: {
          owner,
          systemId,
          name,
          protocol,
          host,
          port,
          sapRouter,
          updatedAt: new Date(),
        },
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    const defaults = getDefaultServiceMaps({ owner, systemId });
    for (const m of defaults) {
      await SapServiceMap.findOneAndUpdate(
        { owner, systemId, serviceType: m.serviceType },
        { $setOnInsert: m },
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
      );
    }

    const created = doc?.createdAt && Date.now() - new Date(doc.createdAt).getTime() < 3000;

    return res.json({
      ok: true,
      created,
      item: {
        _id: String(doc._id),
        name: doc.name || "",
        systemId: doc.systemId,
        protocol: doc.protocol || "https",
        host: doc.host,
        port: doc.port,
        sapRouter: doc.sapRouter || "",
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

// DELETE /sap/systems/:systemId
sapRoutes.delete("/systems/:systemId", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.params.systemId);

    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    const systemDeleteResult = await SapSystem.deleteMany({
      systemId,
      owner: { $in: [owner, "local"] },
    });

    const serviceMapDeleteResult = await SapServiceMap.deleteMany({
      systemId,
      owner: { $in: [owner, "local"] },
    });

    const credentialDeleteResult = await SapCredential.deleteMany({
      owner,
      systemId,
    });

    const now = new Date();

    await SapConnection.updateMany(
      {
        owner,
        systemId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: now,
        },
      }
    );

    return res.json({
      ok: true,
      systemId,
      deleted: true,
      deletedCounts: {
        systems: systemDeleteResult?.deletedCount || 0,
        serviceMaps: serviceMapDeleteResult?.deletedCount || 0,
        credentials: credentialDeleteResult?.deletedCount || 0,
      },
    });
  } catch (e) {
    next(e);
  }
});

// GET /sap/systems/:systemId/services
sapRoutes.get("/systems/:systemId/services", async (req, res, next) => {
  try {
    const systemId = normalizeSystemId(req.params.systemId);
    const owner = "local";

    const items = await SapServiceMap.find({ owner, systemId }).sort({ serviceType: 1 });

    return res.json({
      ok: true,
      items: items.map((x) => ({
        _id: String(x._id),
        systemId: x.systemId,
        serviceType: x.serviceType,
        serviceName: x.serviceName,
        entitySet: x.entitySet,
        entityTypeName: x.entityTypeName,
        idField: x.idField,
        itemField: x.itemField || "",
        idPad: x.idPad,
        itemPad: x.itemPad,
        updatedAt: x.updatedAt,
      })),
    });
  } catch (e) {
    next(e);
  }
});

// PUT /sap/systems/:systemId/services/:serviceType
sapRoutes.put("/systems/:systemId/services/:serviceType", async (req, res, next) => {
  try {
    const systemId = normalizeSystemId(req.params.systemId);
    const serviceType = String(req.params.serviceType || "").trim().toUpperCase();
    const owner = "local";

    if (!["PO", "SO"].includes(serviceType)) {
      return res.status(400).json({ ok: false, error: "serviceType must be PO or SO" });
    }

    const patch = {};
    if (req.body?.serviceName) patch.serviceName = clampString(req.body.serviceName, 120);
    if (req.body?.entitySet) patch.entitySet = clampString(req.body.entitySet, 120);
    if (req.body?.entityTypeName) patch.entityTypeName = clampString(req.body.entityTypeName, 120);
    if (req.body?.idField) patch.idField = clampString(req.body.idField, 120);
    if (req.body?.itemField != null) patch.itemField = clampString(req.body.itemField, 120);

    if (req.body?.idPad != null) patch.idPad = toInt(req.body.idPad);
    if (req.body?.itemPad != null) patch.itemPad = toInt(req.body.itemPad);

    const updated = await SapServiceMap.findOneAndUpdate(
      { owner, systemId, serviceType },
      { $set: { ...patch, updatedAt: new Date() } },
      { returnDocument: "after" }
    );

    if (!updated) {
      return res.status(404).json({ ok: false, error: "Service map not found. Create system first." });
    }

    return res.json({
      ok: true,
      item: {
        _id: String(updated._id),
        systemId: updated.systemId,
        serviceType: updated.serviceType,
        serviceName: updated.serviceName,
        entitySet: updated.entitySet,
        entityTypeName: updated.entityTypeName,
        idField: updated.idField,
        itemField: updated.itemField || "",
        idPad: updated.idPad,
        itemPad: updated.itemPad,
        updatedAt: updated.updatedAt,
      },
    });
  } catch (e) {
    next(e);
  }
});

/* -----------------------------
 * Credentials
 * ----------------------------- */

// GET /sap/credentials/status?systemId=S4D
sapRoutes.get("/credentials/status", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.query?.systemId);

    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    const items = await SapCredential.find({ owner, systemId })
      .select({ sapUser: 1, updatedAt: 1, lastUsedAt: 1 })
      .sort({ lastUsedAt: -1, updatedAt: -1 })
      .lean();

    return res.json({
      ok: true,
      items: items.map((x) => ({
        sapUser: normalizeSapUser(x.sapUser),
        updatedAt: x.updatedAt,
        lastUsedAt: x.lastUsedAt || null,
      })),
      lastUsedSapUser: items?.[0]?.sapUser ? normalizeSapUser(items[0].sapUser) : null,
      hasCredentials: items.length > 0,
    });
  } catch (e) {
    next(e);
  }
});

// POST /sap/credentials
sapRoutes.post("/credentials", async (req, res, next) => {
  try {
    const owner = getOwner(req);

    const systemId = normalizeSystemId(req.body?.systemId);
    const sapUser = normalizeSapUser(req.body?.sapUser || req.body?.username || "");
    const sapPassword = String(req.body?.sapPassword || req.body?.password || "").trim();
    const validate = parseBool(req.body?.validate, true);

    if (!systemId || !sapUser || !sapPassword) {
      return res.status(400).json({ ok: false, error: "systemId, sapUser, sapPassword are required" });
    }

    const system = await SapSystem.findOne({
      systemId,
      owner: { $in: [owner, "local"] },
    }).lean();

    if (!system) {
      return res.status(404).json({
        ok: false,
        error: `System not found for systemId=${systemId}. Create /sap/systems first.`,
      });
    }

    let validationInfo = { validated: !validate };

    if (validate) {
      const systemKind = inferSystemKind(system);

      if (systemKind === "solman") {
        try {
          const loginResult = await loginToSolman({
            protocol: system.protocol || "https",
            host: system.host,
            port: system.port,
            sapUser,
            sapPassword,
          });

          if (!loginResult?.ok) {
            validationInfo = {
              validated: false,
              warning: loginResult?.message || "SAP login validation failed",
            };
          } else {
            validationInfo = { validated: true };
          }
        } catch (err) {
          console.error("[POST /sap/credentials] solman validation failed", {
            systemId,
            sapUser,
            message: err?.message || String(err),
            requestUrl: err?.requestUrl || null,
          });

          validationInfo = buildValidationWarning(err, "SolMan validation failed");
        }
      } else {
        const authOverride = { username: sapUser, password: sapPassword };
        const maps = await SapServiceMap.find({ owner: "local", systemId }).lean();

        if (!maps || maps.length === 0) {
          return res.status(400).json({
            ok: false,
            error: `No service mappings found for systemId=${systemId}.`,
          });
        }

        for (const m of maps) {
          try {
            await getAllowedFieldsWithLabels({
              system,
              service: m,
              entityTypeName: m.entityTypeName,
              authOverride,
              validateAuth: true,
            });
          } catch (err) {
            const msg = String(err?.message || err);
            return res.status(401).json({ ok: false, error: msg });
          }
        }

        validationInfo = { validated: true };
      }
    }

    const enc = encryptString(sapPassword);

    await SapCredential.updateOne(
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
        $setOnInsert: { createdAt: new Date() },
      },
      { upsert: true }
    );

    return res.json({
      ok: true,
      saved: true,
      systemId,
      sapUser,
      ...validationInfo,
    });
  } catch (e) {
    next(e);
  }
});

// DELETE /sap/credentials
sapRoutes.delete("/credentials", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.query?.systemId);
    const sapUser = normalizeSapUser(req.query?.sapUser || "");

    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    if (sapUser) {
      const r = await SapCredential.deleteOne({ owner, systemId, sapUser });
      if ((r?.deletedCount || 0) === 0) {
        return res.status(404).json({ ok: false, error: "Credential not found (already removed?)" });
      }

      await SapConnection.updateMany(
        {
          owner,
          systemId,
          username: sapUser,
          revokedAt: null,
        },
        {
          $set: {
            revokedAt: new Date(),
          },
        }
      );

      return res.json({ ok: true, deletedCount: r.deletedCount });
    }

    const r = await SapCredential.deleteMany({ owner, systemId });

    await SapConnection.updateMany(
      {
        owner,
        systemId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: new Date(),
        },
      }
    );

    return res.json({ ok: true, deletedCount: r.deletedCount || 0 });
  } catch (e) {
    next(e);
  }
});

/* -----------------------------
 * Connection
 * ----------------------------- */

// POST /sap/connect
sapRoutes.post("/connect", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.body?.systemId);
    const sapUser = normalizeSapUser(req.body?.sapUser || "");
    const validate = parseBool(req.body?.validate, true);

    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    const sys = await SapSystem.findOne({
      systemId,
      owner: { $in: [owner, "local"] },
    }).lean();

    if (!sys) {
      return res.status(404).json({ ok: false, error: "System profile not found. Please add system first." });
    }

    const cred = await pickCredential({ owner, systemId, sapUser });
    if (!cred) {
      return res.status(404).json({ ok: false, error: "No credentials saved for this system. Please login first." });
    }

    await SapCredential.updateOne({ _id: cred._id }, { $set: { lastUsedAt: new Date() } });

    let validationInfo = { validated: !validate };

    if (validate) {
      const systemKind = inferSystemKind(sys);

      let plainPassword = "";
      try {
        plainPassword = decryptString({
          enc: cred.encPassword,
          iv: cred.encIv,
          tag: cred.encTag,
        });
      } catch {
        return res.status(500).json({
          ok: false,
          error: "Failed to decrypt stored SAP credentials. Check SAP_CRED_ENC_KEY.",
        });
      }

      if (systemKind === "solman") {
        try {
          const loginResult = await loginToSolman({
            protocol: sys.protocol || "https",
            host: sys.host,
            port: sys.port,
            sapUser: cred.sapUser,
            sapPassword: plainPassword,
          });

          if (!loginResult?.ok) {
            validationInfo = {
              validated: false,
              warning: loginResult?.message || "SAP login validation failed",
            };
          } else {
            validationInfo = { validated: true };
          }
        } catch (e) {
          console.error("[POST /sap/connect] solman validation failed", {
            systemId,
            sapUser: cred.sapUser,
            message: e?.message || String(e),
            requestUrl: e?.requestUrl || null,
          });

          validationInfo = buildValidationWarning(e, "SolMan validation failed");
        }
      } else {
        const svc =
          (await SapServiceMap.findOne({ owner: "local", systemId, serviceType: "PO" }).lean()) ||
          (await SapServiceMap.findOne({ owner: "local", systemId, serviceType: "SO" }).lean());

        if (!svc) {
          return res.status(400).json({
            ok: false,
            error: "No service mappings found for this system. Create system again or configure services.",
          });
        }

        try {
          await getAllowedFieldsWithLabels({
            system: sys,
            service: svc,
            entityTypeName: svc.entityTypeName,
            authOverride: { username: cred.sapUser, password: plainPassword },
            validateAuth: true,
          });

          validationInfo = { validated: true };
        } catch (e) {
          const msg = String(e?.message || e);
          return res.status(401).json({ ok: false, error: msg });
        }
      }
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 12 * 60 * 60 * 1000);

    await SapConnection.updateMany(
      {
        owner,
        systemId,
        revokedAt: null,
      },
      {
        $set: {
          revokedAt: now,
        },
      }
    );

    await SapConnection.create({
      owner,
      description: sys.name || systemId,
      applicationServer: sys.host || "",
      instanceNumber: String(sys.port ?? ""),
      systemId,
      saprouter: sys.sapRouter || "",
      username: normalizeSapUser(cred.sapUser),
      passwordEnc: cred.encPassword || "stored-in-credential",
      connectedAt: now,
      expiresAt,
      revokedAt: null,
    });

    return res.json({
      ok: true,
      connected: true,
      isConnected: true,
      status: "connected",
      active: true,
      systemId,
      sapUser: normalizeSapUser(cred.sapUser),
      firstName: String(cred?.profileFirstName || "").trim(),
      lastName: String(cred?.profileLastName || "").trim(),
      fullName: String(cred?.profileFullName || "").trim(),
      profileUpdatedAt: cred?.profileUpdatedAt || null,
      connectedAt: now,
      expiresAt,
      ...validationInfo,
    });
  } catch (e) {
    next(e);
  }
});

// POST /sap/disconnect
sapRoutes.post("/disconnect", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.body?.systemId);
    const sapUser = normalizeSapUser(req.body?.sapUser || "");
    const now = new Date();

    const query = {
      owner,
      revokedAt: null,
    };

    if (systemId) query.systemId = systemId;
    if (sapUser) query.username = sapUser;

    await SapConnection.updateMany(query, {
      $set: {
        revokedAt: now,
      },
    });

    return res.json({
      ok: true,
      connected: false,
      isConnected: false,
      status: "disconnected",
      active: false,
      systemId: systemId || null,
      sapUser: sapUser || null,
      disconnectedAt: now,
    });
  } catch (e) {
    next(e);
  }
});

// POST /sap/user-profile
sapRoutes.post("/user-profile", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.body?.systemId);
    const sapUser = normalizeSapUser(req.body?.sapUser || "");

    if (!systemId || !sapUser) {
      return res.status(400).json({ ok: false, error: "systemId and sapUser are required" });
    }

    const sys = await SapSystem.findOne({
      systemId,
      owner: { $in: [owner, "local"] },
    }).lean();

    if (!sys) {
      return res.status(404).json({ ok: false, error: "System profile not found." });
    }

    const cred = await pickCredential({ owner, systemId, sapUser });
    if (!cred) {
      return res.status(404).json({ ok: false, error: "No credentials saved for this SAP user/system." });
    }

    const cachedFullName = String(cred?.profileFullName || "").trim();
    const cachedFirstName = String(cred?.profileFirstName || "").trim();
    const cachedLastName = String(cred?.profileLastName || "").trim();

    if (cachedFullName || cachedFirstName || cachedLastName) {
      return res.json({
        ok: true,
        profile: {
          sapUser,
          firstName: cachedFirstName,
          lastName: cachedLastName,
          fullName: cachedFullName,
          cached: true,
          profileUpdatedAt: cred?.profileUpdatedAt || null,
        },
      });
    }

    let plainPassword = "";
    try {
      plainPassword = decryptString({
        enc: cred.encPassword,
        iv: cred.encIv,
        tag: cred.encTag,
      });
    } catch {
      return res.status(500).json({ ok: false, error: "Failed to decrypt stored SAP credentials." });
    }

    const service = { serviceName: "ZSAP_USER_LOGIN_SRV" };
    const filter = `UserName eq '${String(sapUser).replace(/'/g, "''")}' and Password eq '${String(
      plainPassword
    ).replace(/'/g, "''")}'`;

    const relativePath = `user_dataSet?$filter=${encodeURIComponent(filter)}&$format=json`;

    const sapData = await fetchFromSap(
      {
        system: sys,
        service,
        relativePath,
      },
      { username: cred.sapUser, password: plainPassword }
    );

    const results = sapData?.d?.results;
    const row = Array.isArray(results) ? results[0] : sapData?.d;

    const profile = row
      ? {
          sapUser,
          firstName: String(row?.Firstname || "").trim(),
          lastName: String(row?.Lastname || "").trim(),
          fullName: String(row?.Fullname || "").trim(),
          cached: false,
        }
      : { sapUser, firstName: "", lastName: "", fullName: "", cached: false };

    const now = new Date();

    await SapCredential.updateOne(
      { _id: cred._id },
      {
        $set: {
          profileFirstName: profile.firstName,
          profileLastName: profile.lastName,
          profileFullName: profile.fullName,
          profileUpdatedAt: now,
        },
      }
    );

    return res.json({ ok: true, profile: { ...profile, profileUpdatedAt: now } });
  } catch (e) {
    next(e);
  }
});

// GET /sap/status?systemId=S4D
sapRoutes.get("/status", async (req, res, next) => {
  try {
    const owner = getOwner(req);
    const systemId = normalizeSystemId(req.query?.systemId);

    if (!systemId) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    const now = new Date();

    const activeConn = await SapConnection.findOne({
      owner,
      systemId,
      revokedAt: null,
      expiresAt: { $gt: now },
    })
      .sort({ connectedAt: -1, updatedAt: -1 })
      .lean();

    return res.json({
      ok: true,
      connected: Boolean(activeConn),
      isConnected: Boolean(activeConn),
      status: activeConn ? "connected" : "disconnected",
      active: Boolean(activeConn),
      sapUser: activeConn?.username ? normalizeSapUser(activeConn.username) : null,
      connectedAt: activeConn?.connectedAt || null,
      expiresAt: activeConn?.expiresAt || null,
    });
  } catch (e) {
    next(e);
  }
});
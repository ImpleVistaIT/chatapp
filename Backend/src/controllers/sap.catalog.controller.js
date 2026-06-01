import { ingestServiceMetadata } from "../services/metadata/serviceCatalogIngestion.service.js";
import { SapCredential } from "../models/SapCredential.model.js";
import { decryptString } from "../utils/crypto.js";

function normalizeSystemId(v) {
  return String(v || "").trim().toUpperCase();
}

async function getSapAuthForSystemOrThrow({ owner, systemId, sapUser }) {
  const sid = normalizeSystemId(systemId);
  const su = String(sapUser || "").trim().toUpperCase();

  const cred = su
    ? await SapCredential.findOne({ owner, systemId: sid, sapUser: su }).select({
        sapUser: 1,
        encPassword: 1,
        encIv: 1,
        encTag: 1,
      })
    : await SapCredential.findOne({ owner, systemId: sid })
        .sort({ lastUsedAt: -1, updatedAt: -1 })
        .select({
          sapUser: 1,
          encPassword: 1,
          encIv: 1,
          encTag: 1,
        });

  if (!cred) {
    const e = new Error(
      su
        ? `No SAP credentials found for systemId=${sid} sapUser=${su}`
        : `No SAP credentials found for systemId=${sid}`
    );
    e.status = 404;
    throw e;
  }

  const username = String(cred.sapUser || "").trim();
  const password = decryptString({
    enc: cred.encPassword,
    iv: cred.encIv,
    tag: cred.encTag,
  });

  if (!username || !password) {
    const e = new Error("Saved SAP credentials are invalid");
    e.status = 500;
    throw e;
  }

  return { username, password };
}

export async function ingestSapCatalog(req, res, next) {
  try {
    const owner = String(req.user?.id || "").trim();
    if (!owner) {
      return res.status(401).json({ ok: false, error: "Unauthorized" });
    }

    const { systemId, serviceType = null, sapUser = null } = req.body || {};
    const sid = normalizeSystemId(systemId);

    if (!sid) {
      return res.status(400).json({ ok: false, error: "systemId is required" });
    }

    const authOverride = await getSapAuthForSystemOrThrow({
      owner,
      systemId: sid,
      sapUser,
    });

    const result = await ingestServiceMetadata({
      owner: "local",
      systemId: sid,
      serviceType,
      authOverride,
    });

    return res.json({
      ok: true,
      message: "Catalog ingestion completed",
      result,
    });
  } catch (e) {
    next(e);
  }
}
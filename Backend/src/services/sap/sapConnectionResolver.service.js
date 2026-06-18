import { SapSystem } from "../../models/SapSystem.model.js";
import { SapCredential } from "../../models/SapCredential.model.js";
import { decryptString } from "../../utils/crypto.js";

function cleanString(v) {
  return String(v || "").trim();
}

export async function resolveSapConnection({ owner, systemId, sapUser }) {
  const normalizedOwner = cleanString(owner);
  const normalizedSystemId = cleanString(systemId).toUpperCase();
  const normalizedSapUser = cleanString(sapUser).toUpperCase();

  if (!normalizedOwner) {
    const err = new Error("owner is required");
    err.status = 400;
    throw err;
  }

  if (!normalizedSystemId) {
    const err = new Error("systemId is required");
    err.status = 400;
    throw err;
  }

  if (!normalizedSapUser) {
    const err = new Error("sapUser is required");
    err.status = 400;
    throw err;
  }

  let system = await SapSystem.findOne({
    owner: { $in: [normalizedOwner, "local"] },
    systemId: normalizedSystemId,
  }).lean();

  let resolvedSystemId = normalizedSystemId;

  if (!system) {
    const credentialFallback = await SapCredential.findOne({
      owner: normalizedOwner,
      sapUser: normalizedSapUser,
    }).lean();

    const fallbackSystemId = cleanString(credentialFallback?.systemId).toUpperCase();

    if (fallbackSystemId) {
      const fallbackSystem = await SapSystem.findOne({
        owner: { $in: [normalizedOwner, "local"] },
        systemId: fallbackSystemId,
      }).lean();

      if (fallbackSystem) {
        system = fallbackSystem;
        resolvedSystemId = fallbackSystemId;
      }
    }

    if (!system) {
      const err = new Error(`SAP system not found for systemId ${normalizedSystemId}`);
      err.status = 404;
      throw err;
    }
  }

  const credential = await SapCredential.findOne({
    owner: normalizedOwner,
    systemId: resolvedSystemId,
    sapUser: normalizedSapUser,
  }).lean();

  if (!credential) {
    const err = new Error(
      `SAP credential not found for systemId ${resolvedSystemId} and sapUser ${normalizedSapUser}`
    );
    err.status = 404;
    throw err;
  }

  const password = decryptString({
    enc: credential.encPassword,
    iv: credential.encIv,
    tag: credential.encTag,
  });

  return {
    system: {
      _id: system._id,
      owner: system.owner,
      systemId: system.systemId,
      name: system.name || "",
      protocol: system.protocol || "https",
      host: system.host,
      port: system.port,
      sapRouter: system.sapRouter || "",
      baseUrl: system.baseUrl || "",
      allowInsecureTls:
        String(process.env.SAP_ALLOW_INSECURE_TLS || "").toLowerCase() === "true",
    },
    sapAuth: {
      username: credential.sapUser,
      password,
    },
    meta: {
      owner: normalizedOwner,
      systemId: resolvedSystemId,
      sapUser: normalizedSapUser,
      systemName: system.name || "",
      resolvedSystemOwner: system.owner || null,
      resolvedViaSapUserFallback: resolvedSystemId !== normalizedSystemId,
    },
  };
}
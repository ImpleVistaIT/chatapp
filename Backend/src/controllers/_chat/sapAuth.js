import { SapCredential } from "../../models/SapCredential.model.js";
import { decryptString } from "../../utils/crypto.js";
import { normalizeSystemId } from "./auth.js";

// resolve per-system Basic Auth credentials from DB
export async function getSapAuthOrThrow({ owner, systemId, sapUser }) {
  const sid = normalizeSystemId(systemId);
  if (!sid) {
    const e = new Error("systemId is required (frontend must send it in /chat request body).");
    e.status = 400;
    throw e;
  }

  const su = String(sapUser || "").trim();

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
        ? `No SAP credentials saved for systemId=${sid} sapUser=${su}. Please login first.`
        : `No SAP credentials saved for systemId=${sid}. Please login first.`
    );
    e.status = 401;
    throw e;
  }

  const username = String(cred.sapUser || "").trim();
  const password = decryptString({ enc: cred.encPassword, iv: cred.encIv, tag: cred.encTag });
  if (!username || !password) {
    const e = new Error(`Saved credentials for systemId=${sid} are invalid.`);
    e.status = 500;
    throw e;
  }

  await SapCredential.updateOne({ _id: cred._id }, { $set: { lastUsedAt: new Date() } });

  return { username, password };
}
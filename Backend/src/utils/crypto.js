import crypto from "node:crypto";

/**
 * AES-256-GCM encryption/decryption for SAP passwords.
 *
 * Env var (recommended):
 *   SAP_CRED_ENC_KEY
 *
 * Backward compatible fallback:
 *   SAP_SECRET_KEY
 *
 * You can set SAP_CRED_ENC_KEY to a 64-hex string (32 bytes) like:
 *   openssl rand -hex 32
 *
 * Or any long string; we will derive 32 bytes using sha256 when needed.
 */

function getKey32() {
  const raw = process.env.SAP_CRED_ENC_KEY || process.env.SAP_SECRET_KEY;
  if (!raw) throw new Error("SAP_CRED_ENC_KEY (or SAP_SECRET_KEY) is missing");

  const s = String(raw).trim();

  // If raw is exactly 64 hex chars -> treat as 32 bytes directly
  if (/^[0-9a-f]{64}$/i.test(s)) return Buffer.from(s, "hex");

  // If raw looks like base64, allow it if it decodes to 32 bytes
  try {
    const b = Buffer.from(s, "base64");
    if (b.length === 32) return b;
  } catch {
    // ignore
  }

  // Otherwise derive a stable 32-byte key from any string
  return crypto.createHash("sha256").update(s).digest(); // 32 bytes
}

/**
 * Encrypt a string -> store enc/iv/tag separately in Mongo.
 */
export function encryptString(plaintext) {
  const key = getKey32();
  const iv = crypto.randomBytes(12); // recommended for GCM

  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();

  return {
    enc: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

/**
 * Decrypt from separate enc/iv/tag fields.
 */
export function decryptString({ enc, iv, tag }) {
  if (!enc || !iv || !tag) {
    throw new Error("decryptString requires { enc, iv, tag }");
  }

  const key = getKey32();

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    key,
    Buffer.from(String(iv), "base64")
  );

  decipher.setAuthTag(Buffer.from(String(tag), "base64"));

  const plain = Buffer.concat([
    decipher.update(Buffer.from(String(enc), "base64")),
    decipher.final(),
  ]);

  return plain.toString("utf8");
}
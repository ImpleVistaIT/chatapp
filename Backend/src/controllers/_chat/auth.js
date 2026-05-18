// --------------------
// Auth owner + normalizers
// --------------------
export function getOwner(req) {
  const owner = String(req.user?.id || "").trim();
  if (!owner) {
    const e = new Error("Unauthorized");
    e.status = 401;
    throw e;
  }
  return owner;
}

export function normalizeSystemId(systemId) {
  return String(systemId || "").trim().toUpperCase();
}

// sapUser normalizer
export function normalizeSapUser(sapUser) {
  const s = String(sapUser || "").trim();
  return s ? s : null;
}
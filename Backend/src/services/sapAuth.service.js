import { fetchFromSap } from "./sap.service.js";

/**
 * Validate SAP credentials by performing a minimal OData request.
 *
 * Supports:
 * - Per-user/per-system credentials (pass username/password)
 * - Fallback to env SAP_USER/SAP_PASSWORD if username/password not provided
 *
 * NOTE:
 * systemId is accepted for future expansion (e.g., per-system base URL).
 */
export async function testSapCredentials({ systemId = null, username = null, password = null } = {}) {
  // Minimal call to prove auth works.
  const entitySet = process.env.SAP_PO_ENTITYSET || "Po_detailsSet";
  const path = `${entitySet}?$top=1&$format=json`;

  const authOverride =
    username && password
      ? { username: String(username), password: String(password) }
      : null;

  await fetchFromSap(path, authOverride); // throws if auth fails or non-2xx
  return true;
}
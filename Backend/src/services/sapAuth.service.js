import { fetchFromSap } from "./sap.service.js";

/**
 * Validate SAP credentials without depending on business OData metadata.
 *
 * This performs an authenticated request against the service root document
 * rather than downloading $metadata, so a broken CDS/entity type does not
 * block credential validation.
 */
export async function testSapCredentials({ system = null, service = null, username = null, password = null } = {}) {
  const authOverride =
    username && password
      ? { username: String(username), password: String(password) }
      : null;

  await fetchFromSap(
    {
      system,
      service,
      relativePath: "",
      requestMeta: {
        feature: "AUTH_LOGIN",
        requestedSystemId: system?.systemId || null,
        mappedSystemId: service?.systemId || system?.systemId || null,
      },
    },
    authOverride
  );
  return true;
}
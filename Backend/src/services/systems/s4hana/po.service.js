import { buildPoDetailsQuery } from "../../odataQueryBuilder.js";
import { fetchFromSap } from "../../sap/sap.service.js";

function resolveSapContext(req) {
  const system = req?.sapSystem || req?.system || req?.sap?.system;
  const service = req?.sapService || req?.service || req?.sap?.service;
  const auth =
    req?.sapAuth ||
    req?.authOverride ||
    req?.sap?.auth ||
    req?.sapCredentials;

  if (!system) {
    throw new Error("SAP system context missing on request");
  }

  if (!service) {
    throw new Error("SAP service context missing on request");
  }

  if (!auth?.username || !auth?.password) {
    throw new Error("SAP auth context missing on request");
  }

  return { system, service, auth };
}

export async function listPurchaseOrders({ req, query } = {}) {
  const { system, service, auth } = resolveSapContext(req);

  const finalQuery = buildPoDetailsQuery(query || req?.query || {}, {
    maxTop: 200,
  });

  return fetchFromSap(
    {
      system,
      service,
      relativePath: finalQuery,
    },
    auth
  );
}
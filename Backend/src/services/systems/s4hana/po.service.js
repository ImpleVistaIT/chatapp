import { buildPoDetailsQuery } from "../../odataQueryBuilder.js";
import { fetchFromSap } from "../../sap.service.js";

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

  const sapData = await fetchFromSap(
    {
      system,
      service,
      relativePath: finalQuery,
    },
    auth
  );

  return {
    data: sapData,
    totalCount: Number(sapData?.d?.__count || 0) || null,
  };
}

export async function getPurchaseOrderDetails({ req, purchaseOrderId } = {}) {
  const { system, service, auth } = resolveSapContext(req);
  const poNo = String(purchaseOrderId || "").trim();

  if (!poNo) {
    throw new Error("purchaseOrderId is required");
  }

  const finalQuery = buildPoDetailsQuery(
    {
      $filter: `PoNo eq '${poNo.replace(/'/g, "''")}'`,
      $top: 10,
      $skip: 0,
      $select: [
        "PoNo",
        "Plant",
        "RelSt",
        "RelInd",
        "ReleaseState",
        "ReleaseIndicator",
        "Status",
        "DelivStatusItem",
        "DelivInd",
        "DelivStatusItem2",
        "Wemng",
        "NetPrice",
        "NetVal",
        "RlseTotalValue",
        "CurKey",
      ].join(","),
    },
    { maxTop: 10 }
  );

  const sapData = await fetchFromSap(
    {
      system,
      service,
      relativePath: finalQuery,
    },
    auth
  );

  return {
    data: sapData,
    rows: Array.isArray(sapData?.d?.results) ? sapData.d.results : [],
    totalCount: Number(sapData?.d?.__count || 0) || null,
  };
}
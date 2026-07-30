import { resolveSapConnection } from "../services/sap/sapConnectionResolver.service.js";
import { fetchFromSap } from "../services/sap.service.js";
import { SapServiceMap } from "../models/SapServiceMap.model.js";

function cleanString(value) {
  return String(value || "").trim();
}

function pickFirst(row, keys = []) {
  for (const key of Array.isArray(keys) ? keys : []) {
    const value = cleanString(row?.[key]);
    if (value) return value;
  }
  return "";
}

function normalizePoRow(row = {}, poNumber = "") {
  return {
    poNumber: cleanString(pickFirst(row, ["PoNo", "PONo", "PO_NO", "poNo", "po_number"])) || cleanString(poNumber),
    approvalStatus: pickFirst(row, ["Status", "status", "STATUS"]),
    deliveryStatus: pickFirst(row, ["Delivery_Status", "delivery_status", "DELIVERY_STATUS", "DeliveryStatus", "DelivStatusItem", "DelivInd", "DelivStatusItem2"]),
    plant: pickFirst(row, ["Plant", "plant", "PLANT", "WERKS"]),
    netPrice: pickFirst(row, ["Net_price", "NetPrice", "NET_PRICE", "NetVal", "RlseTotalValue", "Price", "Amount"]),
  };
}

export async function getS4dPurchaseOrderDetails(req, res, next) {
  try {
    const poNumber = cleanString(req.params?.poNumber);

    if (!poNumber) {
      return res.status(400).json({ success: false, error: "poNumber is required." });
    }

    const owner = String(req.user?.id || "").trim();
    const service = await SapServiceMap.findOne({
      owner: { $in: [owner, "local"] },
      systemId: "S4D",
      serviceType: "PO",
    }).lean();

    if (!service) {
      return res.status(404).json({
        success: false,
        error: "PO service mapping not found for systemId=S4D.",
      });
    }

    const requestedSystemId = cleanString(service.systemId).toUpperCase();

    const connection = await resolveSapConnection({
      owner,
      systemId: requestedSystemId,
    });

    const relativePath = `${service.entitySet || "Po_detailsSet"}?$filter=PoNo eq '${poNumber.replace(/'/g, "''")}'&$top=1`;

    console.log("[S4D PO] resolved requested system:", {
      owner,
      systemId: requestedSystemId,
      systemHost: connection.system?.host || null,
      systemPort: connection.system?.port || null,
      credentialUser: connection.sapAuth?.username || null,
      serviceName: service.serviceName,
      entitySet: service.entitySet,
      relativePath,
    });

    const sapData = await fetchFromSap(
      {
        system: connection.system,
        service: {
          protocol: connection.system?.protocol || "https",
          host: connection.system?.host,
          port: connection.system?.port,
          serviceName: service.serviceName,
        },
        relativePath,
        requestMeta: {
          feature: "PO",
          requestedSystemId,
          mappedSystemId: service.systemId || requestedSystemId,
          databaseSystemId: connection.system?.systemId || requestedSystemId,
          databaseHost: connection.system?.host || null,
          databasePort: connection.system?.port || null,
        },
      },
      connection.sapAuth
    );

    const rows = Array.isArray(sapData?.d?.results) ? sapData.d.results : [];
    if (rows.length === 0) {
      return res.json({ success: true, data: null, message: "No details found." });
    }

    return res.json({
      success: true,
      data: normalizePoRow(rows[0], poNumber),
    });
  } catch (error) {
    if (typeof next === "function") return next(error);
    return res.status(error?.status || 500).json({
      success: false,
      error: error?.message || "Failed to fetch PO details.",
      details: error?.responseBody || error?.details || null,
      url: error?.url || null,
    });
  }
}
import { resolveSapConnection } from "../services/sap/sapConnectionResolver.service.js";
import { fetchFromSap } from "../services/sap.service.js";

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
    const systemId = cleanString(req.query?.systemId || req.body?.systemId).toUpperCase();
    const sapUser = cleanString(req.query?.sapUser || req.body?.sapUser).toUpperCase();

    if (!poNumber) {
      return res.status(400).json({ success: false, error: "poNumber is required." });
    }

    if (!systemId) {
      return res.status(400).json({ success: false, error: "systemId is required." });
    }

    if (!sapUser) {
      return res.status(400).json({ success: false, error: "sapUser is required." });
    }

    if (!systemId.startsWith("S4D")) {
      return res.status(400).json({ success: false, error: "This endpoint is only available for S4D systems." });
    }

    const owner = String(req.user?.id || "").trim();
    const connection = await resolveSapConnection({ owner, systemId, sapUser });

    const relativePath =
      `Po_detailsSet?$filter=PoNo eq '${poNumber.replace(/'/g, "''")}'&$top=1`;

    const sapData = await fetchFromSap(
      {
        system: connection.system,
        service: {
          protocol: connection.system?.protocol || "https",
          host: connection.system?.host,
          port: connection.system?.port,
          serviceName: "ZMM_PO_DETAILS_SRV",
        },
        relativePath,
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
    return res.status(error?.status || 500).json({ success: false, error: error?.message || "Failed to fetch PO details." });
  }
}
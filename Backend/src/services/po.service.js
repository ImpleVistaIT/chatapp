import { ApiError } from "../utils/errors.js";
import { getEntityEndpoint } from "../sap/endpoints.js";
import { sapGetXml } from "../sap/sapClient.js";

function encodeODataString(val) {
  return String(val).replace(/'/g, "''");
}
function buildDateFilter(filters) {
  const from = filters?.docDateFrom;
  const to = filters?.docDateTo;
  if (!from || !to) return null;

  const fromExpr = `datetime'${from}T00:00:00'`;
  const toExpr = `datetime'${to}T23:59:59'`;

  // Choose which SAP field to filter on:
  // - CREATED_ON -> CrtDate
  // - default -> PoDocDate
  const field = filters?.dateField === "CREATED_ON" ? "CrtDate" : "PoDocDate";

  return `(${field} ge ${fromExpr} and ${field} le ${toExpr})`;
}

export const poService = {
  async fetch({ id, intent, filters }) {
    const entitySet = getEntityEndpoint("PO");
    if (!entitySet) throw new ApiError(500, "PO_ENTITYSET not configured.");

    // ✅ LIST + COUNT (both are collection queries; no id required)
    if (intent === "SHOW_PO" || intent === "COUNT_PO") {
      const configuredTop = Number(process.env.PO_LIST_TOP || 200);

      // COUNT should not need paging; but we can reuse the same query safely.
      // Use large enough top to get all results up to configuredTop.
      const skip = intent === "SHOW_PO" ? Math.max(0, Number(filters?.skip || 0)) : 0;

      const limitDefault = Number(process.env.PO_LIST_TAKE || 20);
      const limit =
        intent === "SHOW_PO"
          ? Math.max(1, Number(filters?.limit || limitDefault))
          : configuredTop;

      const top = Math.max(limit, configuredTop);

      const dateFilter = buildDateFilter(filters);
      const extraFilterParts = [];

      if (filters?.createdBy)
        extraFilterParts.push(`UserCreated eq '${encodeODataString(filters.createdBy)}'`);
      if (filters?.vendorId)
        extraFilterParts.push(`SuppAcoutNo eq '${encodeODataString(filters.vendorId)}'`);
      if (filters?.status)
        extraFilterParts.push(`Status eq '${encodeODataString(filters.status)}'`);

      if (dateFilter) extraFilterParts.push(dateFilter);

      const filterQuery = extraFilterParts.length
        ? `&$filter=${encodeURIComponent(extraFilterParts.join(" and "))}`
        : "";

      const skipQuery = skip ? `&$skip=${skip}` : "";

      const orderByField = filters?.dateField === "CREATED_ON" ? "CrtDate" : "PoDocDate";
      const qs = `?$top=${top}${skipQuery}&$orderby=${orderByField} desc${filterQuery}`;

      try {
        return await sapGetXml(`${entitySet}${qs}`);
      } 
      
      catch (e) {
        console.log("[poService] intent =", intent);
        console.log("[poService] dateFilter =", dateFilter);
        console.log("[poService] URL =", `${entitySet}${qs}`);

        
        const msg = String(e?.message || "");
        const status = e?.status || e?.statusCode;

        const shouldFallback = status === 400 || msg.includes("SAP GET failed (400)");
        if (!shouldFallback) throw e;

        const qsFallback = `?$top=${top}${skipQuery}&$orderby=${orderByField} desc`;
        return sapGetXml(`${entitySet}${qsFallback}`);
      }
    }

    // DETAILS by PO number
    if (!id) throw new ApiError(400, "id is required for PO detail intents.");

    const encodedIdForKey = encodeODataString(id);
    const keyPredicate = `('${encodeURIComponent(encodedIdForKey)}')`;

    try {
      return await sapGetXml(`${entitySet}${keyPredicate}?$format=xml`);
    } catch (e) {
      const filter = `$filter=PoNo eq '${encodeODataString(id)}'`;
      const qs = `?$format=xml&${filter}`;
      return sapGetXml(`${entitySet}${qs}`);
    }
  },
};
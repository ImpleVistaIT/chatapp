/**
 * Intent mapping is config-driven.
 * Each intent defines:
 * - mode: "FIELD" (one-line) or "LIST" or "DETAIL"
 * - paths: fields to extract from transformed structured JSON
 * - template: for one-line response
 */
export const poIntents = {
  // ✅ LIST
  SHOW_PO: {
    mode: "LIST",
    requiresId: false,
    template: ({ data, filters }) => {
      const total = data?.page?.totalMatched ?? data?.count ?? 0;
      const returned = data?.page?.returned ?? data?.count ?? 0;
      const cc = filters?.companyCode ? ` for company code ${filters.companyCode}` : "";
      const more = data?.page?.hasMore ? " Say 'next 10' to see more." : "";
      return `Founded ${total} POs${cc}.`;
    },
  },
  // ✅ PR number + PR item only (related to PO)
  SHOW_PO_PR_ONLY: {
    mode: "DETAIL",      // or FIELD if your UI prefers
    requiresId: true,
    paths: ["pr"],
    template: ({ id, data }) => {
      const pr = data?.pr || [];
      if (!pr.length) return `No PR found for PO ${id}.`;

      const header = `PR details for PO ${id}:`;
      const lines = pr.map((x, idx) => {
        const poItem = x?.po_item || "N/A";
        const name = x?.name || x?.material || "N/A";
        const prNo = x?.pr_number || "N/A";
        const prItem = x?.pr_item || "N/A";
        return `${String(idx + 1).padStart(2, "0")}. PO item ${poItem} | ${name} | PR: ${prNo} | PR item: ${prItem}`;
      });

      return [header, ...lines].join("\n");
    },
  },

  // ✅ FULL DETAILS
  SHOW_PO_DETAILS: {
    mode: "DETAIL",
    paths: ["po_header", "vendor", "status_info", "items", "summary"],
    template: ({ id, data }) => {
      const cc = data?.po_header?.company_code ?? "N/A";
      const vendor = data?.vendor?.vendor_id ?? "N/A";
      const cur = data?.po_header?.currency ?? "N/A";
      const createdOn = data?.po_header?.created_on ?? "N/A";
      const itemCount = data?.summary?.item_count ?? (data?.items?.length ?? 0);
      return `PO ${id}: company code ${cc}, vendor ${vendor}, currency ${cur}, created on ${createdOn}, items ${itemCount}.`;
    },
  },
  // ✅ ONLY ITEMS
  SHOW_PO_ITEMS: {
    mode: "DETAIL",
    paths: ["items"],
  },

  SHOW_PO_ITEM_DETAILS: {
    mode: "FIELD",
    requiresId: true,
    paths: ["item"],
    template: ({ id, data }) => {
      const x = data?.item || {};
      return (
        `Material no: ${x.material ?? "N/A"} (MATNR), ` +
        `Plant: ${x.plant ?? "N/A"} (WERKS), ` +
        `Storage Locn: ${x.storage_location ?? "N/A"} (LGORT), ` +
        `Material grp: ${x.mat_group ?? "N/A"} (MATKL), ` +
        `Quantity: ${x.quantity ?? "N/A"} ${x.quantity_unit ?? ""} (MENGE)`
      );
    },
  },
  COUNT_PO_ITEMS: {
    mode: "FIELD",
    requiresId: true,
    paths: ["count"],
    template: ({ id, data }) => `PO ${id} has ${data["count"] ?? 0} item(s).`,
  },

  // ✅ COMPANY CODE (one-line)
  SHOW_PO_COMPANY_CODE: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.company_code"],
    template: ({ id, data }) =>
      `PO ${id} company code is ${data["po_header.company_code"] || "N/A"}.`,
  },

  // ✅ PURCHASE ORGANIZATION (one-line)
  SHOW_PO_PURCH_ORG: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.po_org"],
    template: ({ id, data }) =>
      `PO ${id} purchase organization is ${data["po_header.po_org"] || "N/A"}.`,
  },

  // ✅ CURRENCY (one-line)
  SHOW_PO_CURRENCY: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.currency"],
    template: ({ id, data }) =>
      `PO ${id} currency is ${data["po_header.currency"] || "N/A"}.`,
  },

  // ✅ EXCHANGE RATE (one-line)
  SHOW_PO_EXCHANGE_RATE: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.exchange_rate", "po_header.currency"],
    template: ({ id, data }) => {
      const rate = data["po_header.exchange_rate"];
      const cur = data["po_header.currency"] || "";
      if (rate == null || rate === "") return `PO ${id} exchange rate is N/A.`;
      return `PO ${id} exchange rate is ${rate}${cur ? ` (${cur})` : ""}.`;
    },
  },

    
// ✅ PURCHASE DOCUMENT TYPE (one-line)
  SHOW_PO_DOC_TYPE: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.doc_type"],
    template: ({ id, data }) =>
      `PO ${id} purchase document type is ${data["po_header.doc_type"] || "N/A"}.`,
  },

  // ✅ PURCHASE DOCUMENT CATEGORY (one-line)
  SHOW_PO_DOC_CATEGORY: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.doc_catg"],
    template: ({ id, data }) =>
      `PO ${id} purchase document category is ${data["po_header.doc_catg"] || "N/A"}.`,
  },

  SHOW_PO_PROFIT_CENTER: {
    mode: "FIELD",
    requiresId: true,
    paths: ["profit_center"],
    template: ({ id, data }) => {
      const v = (data?.profit_center || "").trim();
      return v ? `Profit center for PO ${id}: ${v}` : `No result found for profit center in PO ${id}`;
    },
  },

  SHOW_PO_MEASURES: {
    mode: "DETAIL",
    requiresId: true,
  },


  // ✅ SUPPLIER ACCOUNT NUMBER (one-line)
  SHOW_PO_SUPPLIER: {
    mode: "FIELD",
    paths: ["po_header.po_no", "vendor.vendor_id"],
    template: ({ id, data }) =>
      `PO ${id} supplier account number is ${data["vendor.vendor_id"] || "N/A"}.`,
  },


  // ✅ MATERIAL NUMBERS (all items)
  SHOW_PO_MATERIALS: {
    mode: "DETAIL",
    paths: ["items"],
  },

    // ✅ PLANTS (all items)
  SHOW_PO_PLANTS: {
    mode: "DETAIL",
    paths: ["plants"],
  },

  SHOW_PO_STORAGE_LOCATIONS: {
    mode: "DETAIL",
    paths: ["storage_locations"],
  },

  SHOW_PO_TAX_CODE: {
    mode: "FIELD",
    requiresId: true,
    paths: ["tax_code"],
    template: ({ id, data }) => `Tax code for PO ${id}: ${data?.tax_code ?? "N/A"}`,
  },

  COUNT_PO: {
    mode: "FIELD",
    requiresId: false,
    paths: ["count"],
    template: ({ data }) => `PO count: ${data["count"] ?? 0}`,
  },
  // ✅ MATERIAL GROUPS (all items)
  SHOW_PO_MATERIAL_GROUPS: {
    mode: "DETAIL",
    paths: ["items"],
  },

  // ✅ SCHEDULED QUANTITY + UOM (all items)
  SHOW_PO_QUANTITIES: {
    mode: "DETAIL",
    paths: ["items"],
  },

  // ✅ ORDER PRICE UNIT (all items)
  SHOW_PO_ORDER_PRICE_UNITS: {
    mode: "DETAIL",
    paths: ["items"],
  },
  // ✅ TERMS OF PAYMENT (one-line)
  SHOW_PO_PAYMENT_TERMS: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.payment_terms"],
    template: ({ id, data }) =>
      `PO ${id} terms of payment is ${data["po_header.payment_terms"] || "N/A"}.`,
  },

  // ✅ DISCOUNT DAYS (one-line)
  SHOW_PO_DISCOUNT_DAYS: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.discount_days"],
    template: ({ id, data }) => {
      const v = data["po_header.discount_days"];
      if (v == null) return `PO ${id} discount days is N/A.`;
      return `PO ${id} discount days is ${v}.`;
    },
  },
  // ✅ PURCHASE GROUP (one-line)
  SHOW_PO_PURCH_GROUP: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.po_group"],
    template: ({ id, data }) =>
      `PO ${id} purchase group is ${data["po_header.po_group"] || "N/A"}.`,
  },

  // ✅ STATUS (one-line)
  SHOW_PO_STATUS: {
    mode: "FIELD",
    paths: ["po_header.po_no", "status_info.status"],
    template: ({ id, data }) =>
      `PO ${id} status is ${data["status_info.status"] || "N/A"}.`,
  },

  // ✅ VENDOR (shortcut)
  SHOW_PO_VENDOR: {
    mode: "FIELD",
    paths: ["po_header.po_no", "vendor.vendor_id"],
    template: ({ id, data }) =>
      `PO ${id} vendor is ${data["vendor.vendor_id"] || "N/A"}.`,
  },

  // ✅ PRICING (FULL LIST OF ITEM PRICES)
  SHOW_PO_PRICING: {
    mode: "DETAIL",
    paths: ["pricing"],
  },

  // ✅ DELIVERY (ALL DELIVERY INFO)
  SHOW_PO_DELIVERY: {
    mode: "DETAIL",
    paths: ["delivery"],
  },

  // ---------------- EXISTING ----------------

  PRICE_INFO: {
    mode: "FIELD",
    paths: [
      "po_header.po_no",
      "po_header.currency",
      "summary.net_price_min",
      "summary.net_price_max",
    ],
    template: ({ id, data }) => {
      const cur = data["po_header.currency"] || "";
      const min = data["summary.net_price_min"];
      const max = data["summary.net_price_max"];

      if (min == null) return `PO ${id} net price is N/A.`;
      if (min === max) return `PO ${id} net price is ${min} ${cur}.`;
      return `PO ${id} net price range is ${min}–${max} ${cur}.`;
    },
  },

  CREATED_BY: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.created_by"],
    template: ({ id, data }) =>
      `PO ${id} was created by ${data["po_header.created_by"] || "N/A"}.`,
  },

  CREATED_DATE: {
    mode: "FIELD",
    paths: ["po_header.po_no", "po_header.created_on"],
    template: ({ id, data }) =>
      `PO ${id} was created on ${data["po_header.created_on"] || "N/A"}.`,
  },

  VENDOR_INFO: {
    mode: "FIELD",
    paths: ["po_header.po_no", "vendor.vendor_id"],
    template: ({ id, data }) =>
      `PO ${id} vendor is ${data["vendor.vendor_id"] || "N/A"}.`,
  },

  DELIVERY_INFO: {
    mode: "FIELD",
    paths: ["po_header.po_no", "summary.delivery_date_earliest"],
    template: ({ id, data }) =>
      `PO ${id} earliest delivery date is ${
        data["summary.delivery_date_earliest"] || "N/A"
      }.`,
  },
};
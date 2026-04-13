import { parseODataAtomXml } from "./xml/odataAtomXml.parser.js";
import { toISODate } from "../utils/date.js";

function num(v) {
  if (v == null || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export const poTransformer = {
  async transform({ xml, id, intent, filters }) {
    const rows = await parseODataAtomXml(xml);

    // LIST: PO list (with paging + filters)
    if (intent === "SHOW_PO") {
      
    let headers = buildHeaderList(rows);

    console.log("filters.companyCode =", filters?.companyCode);
    console.log("sample header (before filter) =", headers[0]);
    console.log("sample header company_code =", headers[0]?.company_code);
    console.log("sample row keys =", Object.keys(rows[0] || {})); // ✅ important

    headers = applyHeaderFilters(headers, filters);

      const skip = Math.max(0, Number(filters?.skip || 0));
      const defaultTake = Number(process.env.PO_LIST_TAKE || 20);
      const take = Math.max(1, Number(filters?.limit || defaultTake));
      const page = headers.slice(skip, skip + take);

      return {
        headers: page,
        page: {
          skip,
          take,
          returned: page.length,
          totalMatched: headers.length,
          hasMore: skip + take < headers.length,
        },
      };
    }

    // FIELD: count only
    if (intent === "COUNT_PO") {
      let headers = buildHeaderList(rows);
      headers = applyHeaderFilters(headers, filters);
      return { count: headers.length };
    }

    const details = buildPoDetails(rows, id);

    switch (intent) {
      case "SHOW_PO_DETAILS":
        return details;

      case "SHOW_PO_VENDOR":
        return { vendor: details.vendor };

      case "SHOW_PO_HEADER":
        return { po_header: details.po_header };

      // Items (kept full for frontend compatibility)
      case "SHOW_PO_ITEMS": {
        const poItem = filters?.poItem ? String(filters.poItem) : null;

        let items = details.items || [];
        if (poItem) {
          items = items.filter((x) => String(x?.item?.po_item) === poItem);
        }

        if (poItem && items.length === 0) {
          return { error: `PO item ${poItem} not found in PO ${id}` };
        }

        return {
          items: items.map((x) => ({
            item: x.item,
            quantity: x.quantity,
            pricing: x.pricing,
            delivery: x.delivery,
          })),
        };
      }

      case "SHOW_PO_QUANTITIES": {
        const poItem = filters?.poItem ? String(filters.poItem).trim() : null;

        let items = (details.items || []).map((x) => ({
          po_item: x?.item?.po_item ?? null,
          menge: x?.quantity?.ordered ?? null,
          unit: x?.quantity?.unit ?? null,
        }));

        if (poItem) {
          items = items.filter((r) => String(r.po_item || "").trim() === poItem);
          if (items.length === 0) {
            return { error: `PO item ${poItem} not found in PO ${id}` };
          }
        }

        const nums = items
          .map((r) => (typeof r.menge === "number" ? r.menge : null))
          .filter((v) => v != null);

        const total = nums.reduce((a, b) => a + b, 0);

        return {
          po_number: id,
          quantities: items,
          total_menge: nums.length ? total : null,
        };
      }

      case "SHOW_PO_ITEM_DETAILS": {
        const poItem = filters?.poItem ? String(filters.poItem) : null;
        if (!poItem) return { error: "poItem is required" };

        const item = (details.items || []).find((x) => String(x?.item?.po_item) === poItem);

        if (!item) {
          return { error: `PO item ${poItem} not found in PO ${id}` };
        }

        return {
          item: {
            po_item: item?.item?.po_item ?? null,
            short_text: item?.item?.short_text ?? null,          // TXZ01
            material: item?.item?.material ?? null,              // MATNR
            storage_location: item?.item?.storage_location ?? null, // LGORT_D
            mat_group: item?.item?.mat_group ?? null,            // material grp
            quantity: item?.quantity?.ordered ?? null,           // MENGE
            quantity_unit: item?.quantity?.unit ?? null,
            net_price: item?.pricing?.net_price ?? null,
            currency: item?.pricing?.currency ?? null,
            price_unit: item?.pricing?.price_unit ?? null,
            plant: item?.item?.plant ?? null,
          },
        };
      }

      // Unique plants
      case "SHOW_PO_PLANTS": {
        const plants = [
          ...new Set(
            (details.items || [])
              .map((x) => x?.item?.plant)
              .filter(Boolean)
          ),
        ];
        return { plants };
      }

      case "SHOW_PO_PROFIT_CENTER":
        return { 
          profit_center: details.po_header.profit_center 
        };

      // Unique storage locations
      case "SHOW_PO_STORAGE_LOCATIONS": {
        const storage_locations = [
          ...new Set(
            (details.items || [])
              .map((x) => x?.item?.storage_location)
              .filter(Boolean)
          ),
        ];
        return { storage_locations };
      }

      case "COUNT_PO_ITEMS": {
        const filtered = rows.filter((r) => String(r.PoNo) === String(id));

        // count unique PoItem (e.g., 00001..00009)
        const uniqueItems = new Set(
          filtered
            .map((r) => (r.PoItem ? String(r.PoItem).trim() : ""))
            .filter(Boolean)
        );

        return { count: uniqueItems.size };
      }
            
      case "SHOW_PO_MEASURES": {
        const fields = Array.isArray(filters?.fields) ? filters.fields : null;
        const want = (k) => !fields || fields.includes(k);

        // ✅ item filter (e.g. "00005")
        const poItem = filters?.poItem ? String(filters.poItem).trim() : null;

        // ✅ Keep leading zeros and ignore whitespace
        const norm = (v) => String(v ?? "").trim();

        let items = details.items || [];

        // ✅ Filter to only the requested PO item
        if (poItem) {
          items = items.filter((x) => norm(x?.item?.po_item) === poItem);
        }

        // ✅ If item requested but not found
        if (poItem && items.length === 0) {
          return { error: `PO item ${poItem} not found in PO ${id}` };
        }

        return {
          measures: items.map((x) => {
            const out = {
              po_item: x?.item?.po_item,
              material: x?.item?.material,
            };

            if (want("MAT_TYPE")) out.mat_type = x?.mat_type ?? null;

            if (want("NET_WEIGHT")) out.net_weight = x?.measures?.net_weight ?? null;
            if (want("GROSS_WEIGHT")) out.gross_weight = x?.measures?.gross_weight ?? null;

            if (want("VOLUME")) out.volume = x?.measures?.volume ?? null;

            if (want("VOL_UNIT") || want("VOLUME")) {
              out.volume_unit = x?.measures?.volume_unit ?? null;
            }

            // keep weight unit only if weight requested
            if (want("NET_WEIGHT") || want("GROSS_WEIGHT")) {
              out.weight_unit = x?.measures?.weight_unit ?? null;
            }

            return out;
          }),
        };
      }

      case "SHOW_PO_PRICING": {
        const poItem = filters?.poItem ? String(filters.poItem) : null;

        let items = details.items || [];

        // if item specified, filter down
        if (poItem) {
          items = items.filter((x) => String(x?.item?.po_item) === poItem);
        }

        if (poItem && items.length === 0) {
          return { error: `PO item ${poItem} not found in PO ${id}` };
        }

        // If no item specified and too many items, return last 10 (optional)
        const maxItems = Number(process.env.PO_PRICING_MAX_ITEMS || 10);
        if (!poItem && items.length > maxItems) {
          items = items.slice(0, maxItems);
        }

        return {
          pricing: items.map((x) => ({
            po_item: x?.item?.po_item,
            net_price: x?.pricing?.net_price,
            currency: x?.pricing?.currency,
            price_unit: x?.pricing?.price_unit,
          })),
        };
      }
      case "SHOW_PO_PR_ONLY": {
        const filtered = rows.filter((r) => String(r.PoNo) === String(id));

        return {
          pr: filtered.map((r) => ({
            po_item: r.PoItem ? String(r.PoItem).trim() : null,
            pr_number: r.PrNo ? String(r.PrNo).trim() : null,
            pr_item: r.PrItem ? String(r.PrItem).trim() : null,

            // ✅ Name for the PR item line (choose what you want to show)
            name: r.ShortText ? String(r.ShortText).trim() : null,  // e.g., "BKR-200 Frame"
            material: r.MatNo ? String(r.MatNo).trim() : null,      // optional
          })),
        };
      }
            
      case "SHOW_PO_TAX_CODE":
        return { tax_code: details.po_header.purchase_cd_tax };

      case "SHOW_PO_DELIVERY":
        return { delivery: details.items.map((i) => i.delivery) };

      case "SHOW_PO_ACCOUNTING":
        return { accounting: details.items.map((i) => i.accounting) };

      default:
        // ✅ IMPORTANT: return full details so FIELD intents can pickPaths()
        return details;
    }
  },
};

function buildHeaderList(rows) {
  const byPo = new Map();

  for (const r of rows) {
    const po = r.PoNo;
    if (!po) continue;

    if (!byPo.has(po)) {
      byPo.set(po, {
        po_no: po,
        created_on: toISODate(r.CrtDate || r.PoDocDate),
        company_code: r.CompanyCode ? String(r.CompanyCode).trim() : null, // ✅ ADD
        doc_date: toISODate(r.PoDocDate),
        created_by: r.UserCreated || null,
        vendor_id: r.SuppAcoutNo || null,
        currency: r.CurKey || null,
        status: r.Status || null,
      });
    }
  }

  return Array.from(byPo.values()).sort((a, b) => {
    const da = a.doc_date || a.created_on || "";
    const db = b.doc_date || b.created_on || "";
    return String(db).localeCompare(String(da));
  });
}

function applyHeaderFilters(headers, filters) {
  if (!filters) return headers;

  let out = headers;
  if (filters.companyCode) {
    const cc = String(filters.companyCode).trim();
    out = out.filter((h) => String(h.company_code || "").trim() === cc);
  }

  if (filters.monthOnly) {
    out = out.filter((h) => {
      // Prefer created_on for "created" questions; fallback to doc_date
      const d = h.created_on || h.doc_date;
      if (!d) return false;
      return new Date(d).getUTCMonth() + 1 === filters.monthOnly;
    });
  }

  if (filters.docDateFrom && filters.docDateTo) {
    out = out.filter((h) => {
      // Prefer created_on for "created" questions; fallback to doc_date
      const d = h.created_on || h.doc_date;
      if (!d) return false;
      return d >= filters.docDateFrom && d <= filters.docDateTo;
    });
  }

  if (filters.createdBy) {
    out = out.filter((h) => {
      if (!h.created_by) return false;
      return h.created_by
        .toLowerCase()
        .includes(String(filters.createdBy).toLowerCase());
    });
  }

  if (filters.vendorId) {
    out = out.filter((h) => String(h.vendor_id || "") === String(filters.vendorId));
  }

  if (filters.status) {
    out = out.filter((h) =>
      String(h.status || "")
        .toLowerCase()
        .includes(String(filters.status).toLowerCase())
    );
  }

  return out;
}

function buildPoDetails(rows, poNo) {
  const filtered = rows.filter((r) => String(r.PoNo) === String(poNo));
  const first = filtered[0] || null;

  const out = {
    po_header: {
      po_no: poNo || first?.PoNo || null,
      company_code: first?.CompanyCode || null,
      doc_catg: first?.PoDocCatg || null,
      doc_type: first?.PoDocType || null,
      po_org: first?.PoOrg || null,
      payment_terms: first?.TermsPymntKey || null,
      discount_days: num(first?.DicountDays),
      po_group: first?.PoGrp || null,
      currency: first?.CurKey || null,
      exchange_rate: first?.ExcngRate || null,
      doc_date: toISODate(first?.PoDocDate),
      created_on: toISODate(first?.CrtDate),
      purchase_cd_tax: first?.PurchaseCdTax || null,
      created_by: first?.UserCreated || null,
      profit_center: first?.ProfitCenter ? String(first.ProfitCenter).trim() : null,
    },

    vendor: { vendor_id: first?.SuppAcoutNo || null },

    status_info: {
      status: first?.Status || null,
      purchasing_doc_pr_st: first?.PurchasingDocPrSt || null,
      delivery_indicator: first?.DelivInd ?? null,
      rel_not_yet: first?.RelNotYet ?? null,
    },

    items: filtered.map((r) => ({
      item: {
        po_item: r.PoItem || null,
        material: r.MatNo || null,
        short_text: r.ShortText || null,
        plant: r.Plant || null,
        storage_location: r.StrLoc || null,
        mat_group: r.MatGrp || null,
      },
      pr: {
        pr_number: r.PrNo ? String(r.PrNo).trim() : null,
        pr_item: r.PrItem ? String(r.PrItem).trim() : null,
      },


      // ✅ ADDED: weights/volume + units (per item)
      measures: {
        net_weight: num(r.Ntgew),
        gross_weight: num(r.Brgew),
        volume: num(r.Volum),
        volume_unit: r.VolUnit || null,
        weight_unit: r.UnitOfWt || null,
      },

      // ✅ OPTIONAL: material type (per item)
      mat_type: r.MatType || null,

      quantity: { ordered: num(r.Menge), unit: r.UnitOfMeasure || null },

      pricing: {
        net_price: num(r.NetPrice),
        price_unit: num(r.PriceUnit),
        currency: r.CurKey || null,
      },

      delivery: {
        delivery_date: toISODate(r.ItemDeliDt),
        schedule: r.DeliverySchedule || null,
      },

      accounting: {
        cost_center: r.CostCenter || null,
        gl_account: r.GlActNo || null,
        wbs_element: r.WbsElement || null,
        profit_center: r.ProfitCenter || null,
      },
    })),
  };

  out.summary = computeSummary(out);
  return out;
}

function computeSummary(structured) {
  const items = structured.items || [];
  const prices = items.map((x) => x?.pricing?.net_price).filter((v) => typeof v === "number");
  const dates = items.map((x) => x?.delivery?.delivery_date).filter(Boolean).sort();

  return {
    net_price_min: prices.length ? Math.min(...prices) : null,
    net_price_max: prices.length ? Math.max(...prices) : null,
    delivery_date_earliest: dates.length ? dates[0] : null,
    item_count: items.length,
  };
}
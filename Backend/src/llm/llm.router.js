import { ApiError } from "../utils/errors.js";
import {
  monthStartEndUTC,
  parseIsoDateRangeFromText,
  parseMonthYearFromText,
  toYyyyMmDd,
} from "./dateFilter.js";

const ALLOWED_ENTITIES = ["PO", "PR", "VENDOR"];

const ALLOWED_INTENTS = [
  "SHOW_PO",
  "SHOW_PO_DETAILS",
  "SHOW_PO_ITEMS",
  "SHOW_PO_STATUS",
  "SHOW_PO_PRICING",
  "SHOW_PO_DELIVERY",
  "SHOW_PO_VENDOR",
  "SHOW_PO_COMPANY_CODE",
  "SHOW_PO_DOC_TYPE",
  "SHOW_PO_CURRENCY",
  "SHOW_PO_EXCHANGE_RATE",
  "SHOW_PO_PURCH_ORG",
  "SHOW_PO_PURCH_GROUP",
  "SHOW_PO_DOC_CATEGORY",
  "SHOW_PO_SUPPLIER",
  "SHOW_PO_PAYMENT_TERMS",
  "SHOW_PO_DISCOUNT_DAYS",
  "CREATED_BY",
  "CREATED_DATE",
  "SHOW_PO_MATERIALS",
  "SHOW_PO_PLANTS",
  "SHOW_PO_STORAGE_LOCATIONS",
  "SHOW_PO_MATERIAL_GROUPS",
  "SHOW_PO_QUANTITIES",
  "SHOW_PO_ORDER_PRICE_UNITS",
  "PRICE_INFO",
  "DELIVERY_INFO",
  "VENDOR_INFO",
  "COUNT_PO",
  "SHOW_PO_MEASURES",
  "SHOW_PO_ITEM_DETAILS",
  "SHOW_PO_PR_ONLY",
  //GL Acc No created by MANAS
  "SHOW_PO_GL_ACCOUNT",
];

// Don’t allow huge pasted text to go to the router LLM
const MAX_ROUTER_MESSAGE_CHARS = Number(process.env.LLM_ROUTER_MAX_CHARS || 2000);

// ---------- DATE HELPERS (for today/yesterday/last week) ----------
function isoUTCDateOnly(d) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
    .toISOString()
    .slice(0, 10);
}

function addDaysUTC(date, days) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

function rangeTodayUTC() {
  const now = new Date();
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const s = isoUTCDateOnly(today);
  return { docDateFrom: s, docDateTo: s };
}

function rangeYesterdayUTC() {
  const now = new Date();
  const y = addDaysUTC(now, -1);
  const s = isoUTCDateOnly(y);
  return { docDateFrom: s, docDateTo: s };
}

// Interprets "last week" as last 7 days INCLUDING today
function rangeLast7DaysUTC() {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = addDaysUTC(to, -6);
  return { docDateFrom: isoUTCDateOnly(from), docDateTo: isoUTCDateOnly(to) };
}

function extractPoItemFromQuantityQuestion(message) {
  const m = String(message || "").toLowerCase();

  // match: "item 00005", "po item 5", "line item 10", "item: 00005"
  const match = m.match(/\b(po\s*item|item|line\s*item|line)\s*[:#\-()]?\s*(\d{1,5})\b/i);
  if (!match?.[2]) return null;

  return String(match[2]).padStart(5, "0");
}

function fallbackRouteFromText(msg) {
  const id = extractDocNumber(msg);
  const filters = extractListFilters(msg);

  if (id) {
    const route = { entity: "PO", intent: "SHOW_PO_DETAILS", id, filters: null };
    validateRoute(route);
    return route;
  }

  const route = { entity: "PO", intent: "SHOW_PO", id: null, filters: filters || null };
  validateRoute(route);
  return route;
}
console.log("[router] routeByRules loaded version = COUNT_PO_ENABLED");
export async function routeMessage({ message }) {
  const msg = String(message || "").trim();
  if (!msg) throw new ApiError(400, "message is required");
  console.log("[router] routeByRules loaded version = COUNT_PO_ENABLED");

  const rule = routeByRules(msg);

  // DEBUG
  console.log("[router] msg =", JSON.stringify(msg));
  console.log("[router] msg.length =", msg.length);
  console.log("[router] rule.confident =", rule.confident, "rule.route =", rule.route);

  if (rule.confident) return rule.route;

  if (msg.length > MAX_ROUTER_MESSAGE_CHARS) {
    return fallbackRouteFromText(msg);
  }

  console.log("[router] calling ollama...");

  let llmRoute;
  try {
    llmRoute = await routeWithOllama(msg);
  } catch (e) {
    console.warn("[router] ollama routing failed, using fallback:", e?.message || e);
    return fallbackRouteFromText(msg);
  }

  const merged = {
    entity: llmRoute.entity,
    intent: llmRoute.intent,
    id: llmRoute.id || null,
    filters: llmRoute.filters || null,
  };

  const idFromText = extractDocNumber(msg);
  if (!merged.id && idFromText) merged.id = idFromText;

  if (merged.id && merged.intent === "SHOW_PO") {
    merged.intent = "SHOW_PO_DETAILS";
  }

  validateRoute(merged);
  return merged;
}
// ------------------- TODAY/YESTERDAY /7 DAYS OR ANY DATE -------------------

function rangeLastNDaysUTC(n) {
  const now = new Date();
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const from = addDaysUTC(to, -(n - 1)); // include today
  return { docDateFrom: isoUTCDateOnly(from), docDateTo: isoUTCDateOnly(to) };
}
// ------------------- POITEMS ON PARTICULAR PO NUMBER -------------------

function extractPoItemNumber(message) {
  const m = String(message || "").toLowerCase();

  const match = m.match(
    /\b(po\s*item|item|line\s*item|line)\s*[:#\-()]?\s*(\d{1,5})\b/i
  );

  const raw = match?.[2];
  if (!raw) return null;

  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return null;

  return digits.padStart(5, "0");
}



// ------------------- RULE-BASED -------------------
function routeByRules(message) {
  const m = String(message || "").toLowerCase();

  const id = extractDocNumber(message);
  let filters = extractListFilters(message);

  // ✅ Set created-date field only for "created" questions
  if (/\b(created|were\s+created|created\s+on|created\s+date)\b/.test(m)) {
    filters = { ...(filters || {}), dateField: "CREATED_ON" };

  }
  // ✅ COUNT items in a specific PO (must be before COUNT_PO)
  if (
    id &&
    /\b(how\s+many|count|number\s+of)\b/.test(m) &&
    /\b(items?|line\s*items?)\b/.test(m)
  ) {
    return {
      confident: true,
      route: { entity: "PO", intent: "COUNT_PO_ITEMS", id, filters: null },
    };
  }
  // ✅ List POs by company code
  if (/\b(list|show)\b/.test(m) && /\b(po|pos|purchase\s*orders?)\b/.test(m) && /\bcompany\s*code\b/.test(m)) {
    const companyCodeMatch = m.match(/\bcompany\s*code\s*(?:is|=)?\s*(\d{3,4})\b/);
    const companyCode = companyCodeMatch ? companyCodeMatch[1] : null;

    if (companyCode) {
      return {
        confident: true,
        route: {
          entity: "PO",
          intent: "SHOW_PO",
          id: null,
          filters: { companyCode }, // ✅
        },
      };
    }
  }
  // ✅ COUNT must come early so it isn't shadowed by list rules
  if (
    /\b(how\s+many|count|number\s+of)\b/.test(m) &&
    (/\bpo(s)?\b/.test(m) || /\bpurchase\s*orders?\b/.test(m))
  ) {
    console.log("[router] COUNT_PO RULE HIT", message);
    return {
      confident: true,
      route: { entity: "PO", intent: "COUNT_PO", id: null, filters: filters || null },
    };
  }

  // ✅ PRICING / NET PRICE (optionally by item number)
  // Put this BEFORE measures so "pricing details" doesn't get misrouted.
  if (id && /\b(pricing\s*details?|pricing|net\s*price|price\s*unit|price\s*info|currency|conditions?)\b/.test(m)) {
    const poItem = extractPoItemNumber(message);
    const pricingFilters = poItem ? { poItem } : null;

    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_PRICING", id, filters: pricingFilters },
    };
  }
// ✅ G/L account (GL account) associated with a PO MANAS
if (
  id &&
  /\b(gl\s*account|g\/l\s*account|g\.?l\.?\s*account|general\s*ledger\s*account|glactno)\b/.test(m)
) {
  const poItem = extractPoItemNumber(message); // optional if user says "item 00010"
  return {
    confident: true,
    route: {
      entity: "PO",
      intent: "SHOW_PO_GL_ACCOUNT",
      id,
      filters: poItem ? { poItem } : null,
    },
  };
}

  if (id && /\b(pricing\s*procedure|procedure)\b/.test(m)) {
    return { confident: true, route: { entity:"PO", intent:"SHOW_PO_PRICING_PROCEDURE", id, filters:null } };
  }
  // ✅ PR number + PR item related to a PO
  if (id && /\b(purchase\s*requisition|requisition|pr\b|pr\s*(number|no)?|pr\s*item)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_PR_ONLY", id, filters: null },
    };
  }

  // ✅ WEIGHTS / VOLUME / VOLUME UNIT / MATERIAL TYPE (per PO item)
  if (
    /\b(net\s*weight|gross\s*weight|brgew|ntgew|volume\s*unit|vol\s*unit|volunit|volume|volum|material\s*type|mat\s*type|mattype)\b/.test(m)
  ) {
    const poNo = extractDocNumber(message);
    if (!poNo) return { confident: false, route: null };

    const fields = extractMeasureFields(message);
    const poItem = extractPoItemNumber(message);

    // ✅ If it matched this rule but we couldn't extract any specific field,
    // default to MAT_TYPE (safer than returning EVERYTHING)
    const finalFields = fields.length ? fields : ["MAT_TYPE"];

    const measureFilters = {
      ...(poItem ? { poItem } : null),
      fields: finalFields,
    };

    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_MEASURES", id: poNo, filters: measureFilters },
    };
  }
  // ✅ TAX CODE / Tax on sales/purchases
  if (
    id &&
    /\b(tax\s*code|tax\s+on\s+sales\/purchases(\s+code)?|sales\/purchases\s+code|purchases?\s+code|purchase\s+code|purchase\s+tax|sales\s+tax)\b/i.test(m)
  ) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_TAX_CODE", id, filters: null },
    };
  }

  // ✅ PROFIT CENTER
  if (id && /\b(profit\s*center|profit\s*centre)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_PROFIT_CENTER", id, filters: null },
    };
  }

  // ✅ PO LIST by relative date (today/yesterday/last week) + optional user
  if (
    !id &&
    /\b(po|purchase\s*order|purchase\s*orders)\b/.test(m) &&
    /\b(created|created\s+on|po\s+created|created\s+date)\b/.test(m) &&
    /\b(today|yesterday|last\s+week)\b/.test(m)
  ) {
    let dateRange = null;

    if (/\btoday\b/.test(m)) dateRange = rangeTodayUTC();
    else if (/\byesterday\b/.test(m)) dateRange = rangeYesterdayUTC();
    else if (/\blast\s+week\b/.test(m)) dateRange = rangeLast7DaysUTC();

    const createdByMatch =
      message.match(/\bcreated\s+by\s+user\s+([a-zA-Z0-9_]+)/i) ||
      message.match(/\bcreated\s+by\s+([a-zA-Z0-9_]+)/i) ||
      message.match(/\buser\s+([a-zA-Z0-9_]+)\b/i);

    const createdBy = createdByMatch?.[1] ? createdByMatch[1] : null;

    return {
      confident: true,
      route: {
        entity: "PO",
        intent: "SHOW_PO",
        id: null,
        filters: {
          ...(filters || {}),
          ...(dateRange || {}),
          ...(createdBy ? { createdBy } : {}),
        },
      },
    };
  }

  // ✅ COMPANY CODE (narrow field)
  if (id && /\b(company\s*code|bukrs)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_COMPANY_CODE", id },
    };
  }

  // ✅ PURCHASE ORGANIZATION (EKORG / PoOrg)
  if (
    id &&
    /\b(purchase\s+organisation|purchase\s+organization|purchasing\s+organisation|purchasing\s+organization|purch\s*org|purchasing\s*org|po\s*org|ekorg)\b/.test(
      m
    )
  ) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_PURCH_ORG", id },
    };
  }

  // ✅ CURRENCY (WAERS / CurKey)
  if (id && /\b(currency|cur\s*key|currency\s*key|waers)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_CURRENCY", id },
    };
  }

  // ✅ EXCHANGE RATE (KURSF / ExcngRate)
  if (id && /\b(exchange\s*rate|exch\s*rate|fx\s*rate|rate|kursf)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_EXCHANGE_RATE", id },
    };
  }

  // ��� PURCHASE DOCUMENT TYPE (BSART / PoDocType)
  if (
    id &&
    /\b(purchase\s+document\s+type|purchase\s+doc\s+type|po\s*doc\s*type|document\s+type|doc\s*type|doctype|bsart)\b/.test(
      m
    )
  ) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_DOC_TYPE", id },
    };
  }

  // ✅ PURCHASE DOCUMENT CATEGORY (PoDocCatg)
  if (
    id &&
    /\b(purchase\s+document\s+category|document\s+category|doc\s*category|po\s*doc\s*catg|po\s*doc\s*category|category)\b/.test(
      m
    )
  ) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_DOC_CATEGORY", id },
    };
  }

  // ✅ SUPPLIER / SUPPLIER ACCOUNT NUMBER (SuppAcoutNo)
  if (
    id &&
    /\b(supplier\s+account\s+number|supplier\s+account|supplier|vendor\s+account|suppacoutno)\b/.test(
      m
    )
  ) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_SUPPLIER", id },
    };
  }

  // ✅ MATERIAL NUMBERS
  if (id && /\b(material\s+number|material\s+no|mat\s*no)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "SHOW_PO_MATERIALS", id } };
  }

  // ✅ PLANT
  if (id && /\bplant\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "SHOW_PO_PLANTS", id } };
  }

  // ✅ STORAGE LOCATION
  if (id && /\b(storage\s+details|storage\s+location|str\s*loc|strloc)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "SHOW_PO_STORAGE_LOCATIONS", id } };
  }

  // ✅ MATERIAL GROUPS
  if (id && /\b(material\s+group|mat\s*grp)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "SHOW_PO_MATERIAL_GROUPS", id } };
  }

  // ✅ QUANTITIES
  if (id && /\b(scheduled\s+quantity|quantity|qty|menge)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "SHOW_PO_QUANTITIES", id } };
  }

  // ✅ ORDER PRICE UNIT
  if (id && /\b(order\s+price\s+unit|price\s+unit\s*\(purchasing\)|odpriceunit)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "SHOW_PO_ORDER_PRICE_UNITS", id } };
  }

  // ✅ TERMS OF PAYMENT (TermsPymntKey)
  if (id && /\b(terms\s+of\s+payment|payment\s+terms|terms\s+payment|term\s+key|termspymntkey)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_PAYMENT_TERMS", id },
    };
  }

  // ✅ DISCOUNT DAYS (DicountDays)
  if (id && /\b(discount\s+days|dicountdays)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_DISCOUNT_DAYS", id },
    };
  }

  // ✅ PURCHASE GROUP (EKGRP / PoGrp)
  if (id && /\b(purchase\s+group|purchasing\s+group|purch\s*group|po\s*group|ekgrp)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_PURCH_GROUP", id },
    };
  }
  
    // ✅ PO ITEM DETAILS (single item)
  if (/\b(details?\s+of\s+(po\s*)?item|item\s+details?|material\s+details?\s+of\s+item)\b/.test(m)) {
    const poNo = extractDocNumber(message);
    if (!poNo) return { confident: false, route: null };

    const poItem = extractPoItemNumber(message);
    if (!poItem) return { confident: false, route: null };

    return {
      confident: true,
      route: {
        entity: "PO",
        intent: "SHOW_PO_ITEM_DETAILS",   // ✅ use the single-item intent
        id: poNo,
        filters: { poItem },
      },
    };
  }
  // ✅ DETAILS (+ common misspellings)
  if (id && /\b(detail|details|detials|deteils|detailes|full|complete|entire)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_DETAILS", id },
    };
  }

  // ✅ ITEMS
  if (id && /\b(items|line items|materials)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_ITEMS", id },
    };
  }

  // ✅ STATUS
  if (id && /\b(status|state)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_STATUS", id },
    };
  }

  // ✅ PRICING
  if (id && /\b(price|pricing|amount|cost)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_PRICING", id },
    };
  }

  // ✅ DELIVERY
  if (id && /\b(delivery|delivery date)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_DELIVERY", id },
    };
  }

  // ✅ VENDOR
  if (id && /\b(vendor|supplier)\b/.test(m)) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO_VENDOR", id },
    };
  }

  // ✅ LIST
  if (
    !id &&
    /\b(show|list|display|get)\b/.test(m) &&
    /\b(po|purchase\s*order|purchase\s*orders)\b/.test(m)
  ) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO", id: null, filters },
    };
  }

  if (
    /\b(po|purchase\s*order|purchase\s*orders)\b/.test(m) &&
    /\b(year|month|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/.test(m)
  ) {
    return {
      confident: true,
      route: { entity: "PO", intent: "SHOW_PO", id: null, filters },
    };
  }

  // CREATED BY / CREATED DATE / etc.
  if (id && /\b(who\s+created|created\s+by)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "CREATED_BY", id } };
  }

  if (id && /\b(created\s+on|created\s+date|when\s+was)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "CREATED_DATE", id } };
  }

  if (id && /\b(price|net\s*price|cost|amount|rate)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "PRICE_INFO", id } };
  }

  if (id && /\b(delivery|deliver|delivery\s*date)\b/.test(m)) {
    return { confident: true, route: { entity: "PO", intent: "DELIVERY_INFO", id } };
  }
  // ✅ QUANTITIES / Scheduled Qty (MENGE) with optional PO item filter
  if (
    id &&
    /\b(menge|qty|quantity|scheduled\s*(qty|quantity)|schdeuled\s*(qty|quantity)|schedule(d)?\s*(qty|quantity))\b/.test(m)
  ) {
    const poItem = extractPoItemFromQuantityQuestion(message);

    console.log("[router] QUANTITIES poItem extracted =", poItem); // ✅ debug

    return {
      confident: true,
      route: {
        entity: "PO",
        intent: "SHOW_PO_QUANTITIES",
        id,
        filters: poItem ? { poItem } : null,
      },
    };
  }
  return {
    confident: false,
    route: { entity: "PO", intent: "SHOW_PO", id: null, filters },
  };
}

// ------------------- HELPERS -------------------
function extractDocNumber(message) {
  const ten = message.match(/\b\d{10}\b/);
  if (ten) return ten[0];
  const any = message.match(/\b\d{6,12}\b/);
  return any ? any[0] : null;
}
// ------------------- VOLUME GROSS WEIGHT AND OTHERS -------------------
function extractMeasureFields(message) {
  const m = String(message || "").toLowerCase();
  const fields = new Set();

  const askedMatType = /\b(material\s*type|mat\s*type|mattype)\b/.test(m);
  const askedNet = /\b(net\s*weight|ntgew)\b/.test(m);
  const askedGross = /\b(gross\s*weight|brgew)\b/.test(m);
  const askedVolUnit = /\b(volume\s*unit|vol\s*unit|volunit)\b/.test(m);
  const askedVolume = /\b(volume|volum)\b/.test(m);
  const askedWeightGeneric = /\bweights?\b/.test(m);

  if (askedMatType) fields.add("MAT_TYPE");
  if (askedNet) fields.add("NET_WEIGHT");
  if (askedGross) fields.add("GROSS_WEIGHT");

  if (askedVolUnit) fields.add("VOL_UNIT");
  else if (askedVolume) fields.add("VOLUME");

  if (askedWeightGeneric && !askedNet && !askedGross) {
    fields.add("NET_WEIGHT");
    fields.add("GROSS_WEIGHT");
  }

  return [...fields];
}

function extractListFilters(message) {
  const m = String(message || "").toLowerCase();
  const filters = {};

  // ✅ "last N days" (e.g., last 2 days, last 15 days)
  const lastNDays = m.match(/\blast\s+(\d+)\s+days?\b/);
  if (lastNDays?.[1]) {
    const n = Number(lastNDays[1]);
    if (Number.isFinite(n) && n > 0 && n <= 365) { // cap to avoid crazy queries
      Object.assign(filters, rangeLastNDaysUTC(n));
    }
  }

  // ✅ relative date filters
  if (/\btoday\b/.test(m)) {
    Object.assign(filters, rangeTodayUTC());
  } else if (/\byesterday\b/.test(m)) {
    Object.assign(filters, rangeYesterdayUTC());
  } else if (/\blast\s+week\b/.test(m)) {
    Object.assign(filters, rangeLast7DaysUTC());
  }

  if (/\blast\s+month\b/.test(m)) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const mon = now.getUTCMonth() + 1;
    const prevMon = mon === 1 ? 12 : mon - 1;
    const prevYear = mon === 1 ? y - 1 : y;
    const { start, end } = monthStartEndUTC(prevYear, prevMon);
    filters.docDateFrom = toYyyyMmDd(start);
    filters.docDateTo = toYyyyMmDd(end);
  } else if (/\bthis\s+month\b/.test(m) || /\bcurrent\s+month\b/.test(m)) {
    const now = new Date();
    const y = now.getUTCFullYear();
    const mon = now.getUTCMonth() + 1;
    const { start, end } = monthStartEndUTC(y, mon);
    filters.docDateFrom = toYyyyMmDd(start);
    filters.docDateTo = toYyyyMmDd(end);
  }


  // ✅ single explicit ISO date like 2025-12-03 (treat as one-day range)
  const singleIso = message.match(/\b(20\d{2}-\d{2}-\d{2})\b/);
  if (singleIso?.[1]) {
    filters.docDateFrom = singleIso[1];
    filters.docDateTo = singleIso[1];
  }

  // ✅ only if date NOT already set by singleIso / today / yesterday / last week / etc.
  if (!filters.docDateFrom && !filters.docDateTo) {
    const my = parseMonthYearFromText(message);
    if (my) {
      const { month, year } = my;

      if (month && year) {
        const { start, end } = monthStartEndUTC(year, month);
        filters.docDateFrom = toYyyyMmDd(start);
        filters.docDateTo = toYyyyMmDd(end);
      } else if (month && !year) {
        filters.monthOnly = month;
      } else if (!month && year) {
        const start = new Date(Date.UTC(year, 0, 1));
        const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));
        filters.docDateFrom = toYyyyMmDd(start);
        filters.docDateTo = toYyyyMmDd(end);
      }
    }
  }

  // ✅ only if date still NOT set (so it can’t override singleIso)
  if (!filters.docDateFrom && !filters.docDateTo) {
    const range = parseIsoDateRangeFromText(message);
    if (range) {
      filters.docDateFrom = toYyyyMmDd(range.start);
      filters.docDateTo = toYyyyMmDd(range.end);
    }
  }

  const createdBy =
    message.match(/\bcreated\s+by\s+user\s+([a-zA-Z0-9_]+)/i) ||
    message.match(/\bcreated\s+by\s+([a-zA-Z0-9_]+)/i);

  if (createdBy && createdBy[1]) {
    const val = createdBy[1];
    if (!/^(vendor|supplier)$/i.test(val)) {
      filters.createdBy = val;
    }
  }

  const vendor = message.match(/\b(vendor|supplier)\s+(\d{4,12})\b/i);
  if (vendor && vendor[2]) filters.vendorId = vendor[2];

  const status = message.match(/\bstatus\s+([a-zA-Z0-9_]+)\b/i);
  if (status && status[1]) filters.status = status[1];

  const limitMatch = message.match(/\b(last|top)\s+(\d+)\b/i);
  if (limitMatch) {
    filters.limit = Number(limitMatch[2]);
  }

  return Object.keys(filters).length ? filters : null;
}

function mergeFilters(a, b) {
  if (!a && !b) return null;
  return { ...(b || {}), ...(a || {}) };
}

// ------------------- OLLAMA -------------------
async function routeWithOllama(message) {
  const prompt = buildPrompt(message);
  console.log("[router] prompt.length =", prompt.length);

  const url = process.env.OLLAMA_URL || "http://localhost:11434/api/generate";
  const model = process.env.OLLAMA_MODEL || "llama3:latest";

  // routing timeout (keep low; fallbackRouteFromText will handle failures)
  const timeoutMs = Number(process.env.LLM_TIMEOUT_MS || 8000);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: controller.signal,
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        options: {
          temperature: 0,
          num_predict: Number(process.env.LLM_ROUTER_NUM_PREDICT || 128),
          top_p: 0.9,
          top_k: 20,
          repeat_penalty: 1.05,
          stop: ["}\n", "}\r\n", "}"],
        },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text().catch(() => "");
      throw new ApiError(502, `Ollama error ${resp.status}: ${t.slice(0, 300)}`);
    }

    const json = await resp.json();
    const parsed = safeJsonFromText(json?.response);

    if (!parsed) throw new ApiError(500, "LLM returned invalid JSON.");
    return parsed;
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new ApiError(504, `LLM routing timed out after ${timeoutMs}ms`);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}
function buildPrompt(message) {
  return `
Return ONLY JSON.

Schema:
{
  "entity":"PO|PR|VENDOR",
  "intent":"SHOW_PO|SHOW_PO_DETAILS|SHOW_PO_ITEMS|SHOW_PO_STATUS|SHOW_PO_PRICING|SHOW_PO_DELIVERY|SHOW_PO_VENDOR|SHOW_PO_COMPANY_CODE|SHOW_PO_DOC_TYPE|SHOW_PO_CURRENCY|SHOW_PO_EXCHANGE_RATE|SHOW_PO_PURCH_ORG|SHOW_PO_PURCH_GROUP|SHOW_PO_DOC_CATEGORY|SHOW_PO_SUPPLIER|SHOW_PO_PAYMENT_TERMS|SHOW_PO_DISCOUNT_DAYS|CREATED_BY|CREATED_DATE|PRICE_INFO|DELIVERY_INFO|VENDOR_INFO|SHOW_PO_MATERIALS|SHOW_PO_PLANTS|SHOW_PO_STORAGE_LOCATIONS|SHOW_PO_MATERIAL_GROUPS|SHOW_PO_QUANTITIES|SHOW_PO_ORDER_PRICE_UNITS|COUNT_PO|SHOW_PO_MEASURES|SHOW_PO_PR_ONLY|SHOW_PO_GL_ACCOUNT",
  "id":"string or null",
  "filters":{...} or null
}

Rules:
- If the message asks for company code/BUKRS of a PO, use intent SHOW_PO_COMPANY_CODE.
- If a 10-digit PO number is present, set entity="PO" and id.
- Prefer narrow intents (company code/vendor/status/items/pricing/delivery) when asked; otherwise SHOW_PO_DETAILS.
- If no id, SHOW_PO (list).
- If user asks for created today/yesterday/last week, use SHOW_PO with filters.
- If user asks "how many POs...", use COUNT_PO.

User message:
${JSON.stringify(message)}
`.trim();
}

function safeJsonFromText(text) {
  const s = String(text || "").trim();
  const start = s.indexOf("{");
  const end = s.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ------------------- VALIDATION -------------------
function validateRoute(route) {
  if (!ALLOWED_ENTITIES.includes(route.entity)) {
    throw new ApiError(400, "Unsupported entity.");
  }
  if (!ALLOWED_INTENTS.includes(route.intent)) {
    throw new ApiError(400, "Unsupported intent.");
  }
  if (!["SHOW_PO", "COUNT_PO"].includes(route.intent) && !route.id) {
    throw new ApiError(400, "Document number missing.");
  }
}
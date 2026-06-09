import { ChatSession } from "../../../models/ChatSession.model.js";
import { saveAssistantMessage, step } from "../stream.shared.js";

export function cleanString(v) {
  return String(v || "").trim();
}

export function normalizeSapUsername(value = "") {
  return cleanString(value).toUpperCase();
}

export function pickCreateCrEntities(raw = {}) {
  return {
    ShortDesc: String(raw.ShortDesc || raw.shortDesc || "").trim(),
    DeliveryResponsible: String(raw.DeliveryResponsible || raw.deliveryResponsible || "").trim(),
    Developer: String(raw.Developer || raw.developer || "").trim(),
    Tester: String(raw.Tester || raw.tester || "").trim(),
    WorkItemReference: String(raw.WorkItemReference || raw.workItemReference || "").trim(),
    Landscape: String(raw.Landscape || raw.landscape || "").trim(),
    REQ_URL_NAV: Array.isArray(raw.REQ_URL_NAV) ? raw.REQ_URL_NAV : [],
  };
}

export function getMissingCreateCrFields(payload = {}) {
  const required = [
    "ShortDesc",
    "DeliveryResponsible",
    "Developer",
    "Tester",
    "WorkItemReference",
    "Landscape",
  ];

  return required.filter((key) => !String(payload?.[key] || "").trim());
}

export function resolveBusinessScope(query = "", raw = {}) {
  const explicit = cleanString(
    raw.businessScope || raw.scope || raw.region || raw.processScope
  ).toUpperCase();

  const q = cleanString(query).toLowerCase();

  if (explicit === "ROW") {
    return { label: "ROW", processType: "YMHF" };
  }

  if (explicit === "INDIA") {
    return { label: "INDIA", processType: "YMH1" };
  }

  if (cleanString(raw.processType || raw.PROCESS_TYPE).toUpperCase() === "YMHF") {
    return { label: "ROW", processType: "YMHF" };
  }

  if (cleanString(raw.processType || raw.PROCESS_TYPE).toUpperCase() === "YMH1") {
    return { label: "INDIA", processType: "YMH1" };
  }

  if (/\brow\b/.test(q)) {
    return { label: "ROW", processType: "YMHF" };
  }

  if (/\bindia\b/.test(q)) {
    return { label: "INDIA", processType: "YMH1" };
  }

  return null;
}

export function pickCrDetailsEntities(raw = {}, query = "") {
  const scope = resolveBusinessScope(query, raw);

  return {
    objectId: String(
      raw.objectId ||
        raw.OBJECT_ID ||
        raw.OBJ_ID ||
        raw.changeRequestId ||
        raw.crId ||
        raw.crNumber ||
        ""
    ).trim(),
    processType: String(
      raw.processType || raw.PROCESS_TYPE || scope?.processType || ""
    ).trim(),
    businessScope: scope?.label || "",
  };
}

export function toCrDetailsArray(result) {
  if (Array.isArray(result?.results)) return result.results;
  if (Array.isArray(result?.result?.results)) return result.result.results;
  if (Array.isArray(result?.data?.results)) return result.data.results;
  if (Array.isArray(result?.raw?.d?.results)) return result.raw.d.results;
  if (Array.isArray(result?.d?.results)) return result.d.results;
  if (result?.raw?.d && !Array.isArray(result.raw.d.results)) return [result.raw.d];
  if (result?.d && !Array.isArray(result.d.results)) return [result.d];
  return [];
}

export function formatDisplayDate(value) {
  const s = cleanString(value);

  if (/^\d{8}$/.test(s)) {
    return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
  }

  return s || "-";
}

export function getCrNumber(item = {}) {
  return cleanString(item?.OBJECT_ID || item?.OBJ_ID || "-");
}

export function formatCrDetailsReply(item) {
  return [
    `CR Number: ${getCrNumber(item)}`,
    `Short Description: ${item?.SHORT_DESC || "-"}`,
    `Status: ${item?.STATUS || "-"}`,
    `Priority: ${item?.PRIORITY || "-"}`,
    `Process Type: ${item?.PROCESS_TYPE || "-"}`,
    `Created On: ${formatDisplayDate(item?.CREATED_ON)}`,
    `Last Changed By: ${item?.LAST_CHANGED_BY || "-"}`,
    `Last Changed At: ${item?.LAST_CHANGED_AT || "-"}`,
    `Category: ${item?.CATEGORY || "-"}`,
  ].join("\n");
}

export function getDaysInMonth(year, monthIndexZeroBased) {
  return new Date(year, monthIndexZeroBased + 1, 0).getDate();
}

export function inferDateRangeFromQuery(query = "") {
  const q = cleanString(query).toLowerCase();

  if (!q) return null;

  const months = {
    january: 1,
    february: 2,
    march: 3,
    april: 4,
    may: 5,
    june: 6,
    july: 7,
    august: 8,
    september: 9,
    october: 10,
    november: 11,
    december: 12,
  };

  const monthMatch = q.match(
    /\b(?:in\s+the\s+month\s+of|month\s+of|for)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/
  );

  if (monthMatch) {
    const monthName = monthMatch[1];
    const year = Number(monthMatch[2]);
    const month = months[monthName];
    const fromDate = `${year}${String(month).padStart(2, "0")}01`;
    const toDate = `${year}${String(month).padStart(2, "0")}${String(
      getDaysInMonth(year, month - 1)
    ).padStart(2, "0")}`;

    return {
      fromDate,
      toDate,
      granularity: "month",
    };
  }

  const yearMatch = q.match(/\b(?:in\s+the\s+year\s+of|year\s+of|for)\s+(20\d{2})\b/);

  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return {
      fromDate: `${year}0101`,
      toDate: `${year}1231`,
      granularity: "year",
    };
  }

  const plainYearMatch = q.match(/\bin\s+(20\d{2})\b/);
  if (plainYearMatch && /\b(cr|change request|status)\b/.test(q)) {
    const year = Number(plainYearMatch[1]);
    return {
      fromDate: `${year}0101`,
      toDate: `${year}1231`,
      granularity: "year",
    };
  }

  return null;
}

export function inferCrStatusFilterFromQuery(query = "") {
  const q = cleanString(query).toLowerCase();

  if (!q) {
    return {
      status: "",
      excludeStatuses: [],
      statusMode: "",
    };
  }

  if (q.includes("pending")) {
    return {
      status: "",
      excludeStatuses: ["CLOSED", "REJECTED"],
      statusMode: "pending",
    };
  }

  const known = [
    "open",
    "closed",
    "approved",
    "rejected",
    "in progress",
    "under implementation",
    "success",
    "completed",
  ];

  for (const value of known) {
    if (q.includes(value)) {
      return {
        status: value.toUpperCase(),
        excludeStatuses: [],
        statusMode: "",
      };
    }
  }

  return {
    status: "",
    excludeStatuses: [],
    statusMode: "",
  };
}

export function inferRequestedTop(query = "", fallback = 10) {
  const q = cleanString(query).toLowerCase();

  const nextMatch = q.match(/\b(?:show\s+)?next\s+(\d+)\b/);
  if (nextMatch) return Math.max(1, Number(nextMatch[1]));

  const topMatch = q.match(/\b(?:top|last)\s+(\d+)\b/);
  if (topMatch) return Math.max(1, Number(topMatch[1]));

  return fallback;
}

export function inferRequestedSkip(raw = {}, query = "") {
  if (raw?.skip != null && Number.isFinite(Number(raw.skip))) {
    return Math.max(0, Number(raw.skip));
  }

  const q = cleanString(query).toLowerCase();
  if (/\b(?:show\s+)?next\s+\d+\b/.test(q)) {
    return Math.max(0, Number(raw?.nextSkip || 0));
  }

  return 0;
}

export function isNextPageQuery(query = "") {
  const q = cleanString(query).toLowerCase();
  return /\b(?:show\s+)?next\s+\d+\b/.test(q);
}

export function inferCreatedByFilterFromQuery(query = "", raw = {}) {
  const rawCreatedBy = cleanString(
    raw.createdBy ||
      raw.CREATED_BY ||
      raw.created_by ||
      raw.creator ||
      raw.CREATEDBY ||
      raw.user ||
      raw.username
  );

  if (rawCreatedBy) {
    const normalized = rawCreatedBy.toLowerCase();

    if (["me", "my", "mine", "myself"].includes(normalized)) {
      return {
        createdBy: "ME",
        createdByMode: "self",
      };
    }

    return {
      createdBy: normalizeSapUsername(rawCreatedBy),
      createdByMode: "explicit",
    };
  }

  const q = cleanString(query).toLowerCase();

  if (!q) {
    return {
      createdBy: "",
      createdByMode: "",
    };
  }

  if (
    /\bcreated by me\b/.test(q) ||
    /\bcreated by myself\b/.test(q) ||
    /\bshow my cr\b/.test(q) ||
    /\bshow my crs\b/.test(q) ||
    /\bmy cr\b/.test(q) ||
    /\bmy crs\b/.test(q) ||
    /\bmy change request\b/.test(q) ||
    /\bmy change requests\b/.test(q)
  ) {
    return {
      createdBy: "ME",
      createdByMode: "self",
    };
  }

  const createdByMatch = q.match(/\bcreated by\s+([a-z0-9._-]+)\b/i);
  if (createdByMatch) {
    return {
      createdBy: normalizeSapUsername(createdByMatch[1]),
      createdByMode: "explicit",
    };
  }

  return {
    createdBy: "",
    createdByMode: "",
  };
}

export function inferCrListIntent(classified, query = "") {
  const intent = cleanString(classified?.intent).toLowerCase();
  const q = cleanString(query).toLowerCase();

  if (
    intent === "list_change_requests" ||
    intent === "get_change_request_status_list" ||
    intent === "get_change_request_status" ||
    intent === "list_change_request_status"
  ) {
    return true;
  }

  if (
    /\b(?:show\s+)?next\s+\d+\b/.test(q) ||
    /\bcr\b/.test(q) ||
    /\bchange request\b/.test(q) ||
    /\bchange requests\b/.test(q) ||
    /\bcr list\b/.test(q) ||
      /\bshow cr status\b/.test(q) ||
    /\bopen cr\b/.test(q) ||
    /\bapproved cr\b/.test(q) ||
    /\brejected cr\b/.test(q) ||
    /\bclosed cr\b/.test(q) ||
    /\bpending cr\b/.test(q) ||
    /\bpending\b/.test(q) ||
    /\bunder implementation\b/.test(q) ||
    /\blast\s+\d+\s+cr\b/.test(q) ||
    /\blast\s+\d+\s+cr\s+status\b/.test(q) ||
    /\bcreated in this week\b/.test(q) ||
    /\bcreated from\b/.test(q) ||
    /\bcreated by me\b/.test(q) ||
    /\bcreated by\b/.test(q) ||
    /\bmy cr\b/.test(q) ||
    /\bmy crs\b/.test(q) ||
    /\bmy change request\b/.test(q) ||
    /\bmy change requests\b/.test(q) ||
    /\bthis month\b/.test(q) ||
    /\blast month\b/.test(q) ||
    /\bthis year\b/.test(q) ||
    /\bin the month of\b/.test(q) ||
    /\bmonth of\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/.test(q) ||
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{4}\b/.test(q) ||
    /\bin the year of\s+20\d{2}\b/.test(q) ||
    /\byear of\s+20\d{2}\b/.test(q) ||
    /\bdependency transport\b/.test(q) ||
    /\bdependency transports\b/.test(q) ||
    /\brow\b/.test(q) ||
    /\bindia\b/.test(q)
  ) {
    return true;
  }

  return false;
}

export function inferCrCreatedByIntent(query = "", raw = {}) {
  const q = cleanString(query).toLowerCase();

  const inferred = inferCreatedByFilterFromQuery(query, raw);

  if (inferred?.createdByMode === "self") {
    return {
      intent: "list_change_requests_by_created_by",
      createdBy: "ME",
      createdByMode: "self",
    };
  }

  if (inferred?.createdByMode === "explicit" && inferred?.createdBy) {
    return {
      intent: "list_change_requests_by_created_by",
      createdBy: inferred.createdBy,
      createdByMode: "explicit",
    };
  }

  if (
    /\bcreated by me\b/.test(q) ||
    /\bcreated by myself\b/.test(q) ||
    /\bshow my cr\b/.test(q) ||
    /\bshow my crs\b/.test(q) ||
    /\bmy cr\b/.test(q) ||
    /\bmy crs\b/.test(q) ||
    /\bmy change request\b/.test(q) ||
    /\bmy change requests\b/.test(q)
  ) {
    return {
      intent: "list_change_requests_by_created_by",
      createdBy: "ME",
      createdByMode: "self",
    };
  }

  const createdByMatch = q.match(/\bcreated by\s+([a-z0-9._-]+)\b/i);
  if (createdByMatch) {
    return {
      intent: "list_change_requests_by_created_by",
      createdBy: normalizeSapUsername(createdByMatch[1]),
      createdByMode: "explicit",
    };
  }

  return null;
}

export function pickCrListEntities(raw = {}, query = "") {
  const q = cleanString(query);
  const scope = resolveBusinessScope(q, raw);
  const inferredDateRange = inferDateRangeFromQuery(q);
  const inferredStatus = inferCrStatusFilterFromQuery(q);
  const inferredCreatedBy = inferCreatedByFilterFromQuery(q, raw);

  const requestedTop =
    raw.top ??
    raw.limit ??
    (isNextPageQuery(q) ? inferRequestedTop(q, 10) : inferRequestedTop(q, 10));

  const rawCreatedBy = cleanString(
    raw.createdBy ||
      raw.CREATED_BY ||
      raw.created_by ||
      raw.creator ||
      ""
  );

  const rawCreatedByMode = cleanString(raw.createdByMode || "");

  const displayOffset =
    raw.displayOffset != null && Number.isFinite(Number(raw.displayOffset))
      ? Math.max(0, Number(raw.displayOffset))
      : 0;

  const nextDisplayOffset =
    raw.nextDisplayOffset != null && Number.isFinite(Number(raw.nextDisplayOffset))
      ? Math.max(0, Number(raw.nextDisplayOffset))
      : displayOffset;

  return {
    businessScope: scope?.label || cleanString(raw.businessScope || raw.scope || ""),
    processType:
      cleanString(raw.processType || raw.PROCESS_TYPE || scope?.processType || "") || "",
    triggerAll: cleanString(raw.triggerAll || raw.TRIGGER_ALL || "X") || "X",
    fromDate: cleanString(raw.fromDate || raw.FROM_DATE || inferredDateRange?.fromDate || ""),
    toDate: cleanString(raw.toDate || raw.TO_DATE || inferredDateRange?.toDate || ""),
    status: cleanString(raw.status || raw.STATUS || inferredStatus.status),
    excludeStatuses: Array.isArray(raw.excludeStatuses)
      ? raw.excludeStatuses
      : inferredStatus.excludeStatuses,
    statusMode: cleanString(raw.statusMode || inferredStatus.statusMode || ""),
    createdBy: cleanString(rawCreatedBy || inferredCreatedBy.createdBy || ""),
    createdByMode: cleanString(rawCreatedByMode || inferredCreatedBy.createdByMode || ""),
    dateText: cleanString(raw.dateText || raw.dateRangeText || q),
    top: requestedTop,
    skip: inferRequestedSkip(raw, q),
    nextSkip:
      raw.nextSkip != null && Number.isFinite(Number(raw.nextSkip))
        ? Math.max(0, Number(raw.nextSkip))
        : 0,
    displayOffset,
    nextDisplayOffset,
    orderBy: cleanString(raw.orderBy || "CREATED_ON desc") || "CREATED_ON desc",
  };
}

export function padCell(value, width) {
  const s = cleanString(value || "-");
  if (s.length > width) return `${s.slice(0, Math.max(0, width - 1))}…`;
  return s.padEnd(width, " ");
}

export function formatCrListReply(rows = [], params = {}) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return "No change requests found.";
  }

  const header = [`Found ${rows.length} change request(s).`];

  if (params?.businessScope) {
    header.push(`Landscape: ${params.businessScope}`);
  }

  if (params?.createdBy) {
    header.push(`Created By: ${params.createdBy}`);
  }

  if (params?.fromDate || params?.toDate) {
    header.push(
      `Date Range: ${formatDisplayDate(params?.fromDate)} to ${formatDisplayDate(params?.toDate)}`
    );
  }

  if (params?.statusMode === "pending") {
    header.push("Status Filter: Pending (excluding CLOSED and REJECTED)");
  } else if (params?.status) {
    header.push(`Status Filter: ${params.status}`);
  }

  if (params?.skip) {
    header.push(`Offset: ${params.skip}`);
  }

  if (rows.length <= 2) {
    const body = rows
      .map((item) => {
        const crNumber = getCrNumber(item);
        const status = item?.STATUS || "-";
        const createdOn = formatDisplayDate(item?.CREATED_ON);
        const shortDesc = item?.SHORT_DESC || "-";

        return [
          `CR Number: ${crNumber}`,
          `Status: ${status}`,
          `Created On: ${createdOn}`,
          `Short Description: ${shortDesc}`,
        ].join("\n");
      })
      .join("\n\n");

    return `${header.join("\n")}\n\n${body}`;
  }

  const widths = {
    no: 10,
    cr: 16,
    status: 26,
    createdOn: 14,
    shortDesc: 50,
  };

  const tableHeader = [
    padCell("Serial No", widths.no),
    padCell("CR Number", widths.cr),
    padCell("Status", widths.status),
    padCell("Created On", widths.createdOn),
    padCell("Short Description", widths.shortDesc),
  ].join(" | ");

  const body = rows
    .map((item, index) =>
      [
        padCell(
          String(
            ((params?.displayOffset ?? params?.skip) || 0) + index + 1
          ),
          widths.no
        ),
        padCell(getCrNumber(item), widths.cr),
        padCell(item?.STATUS || "-", widths.status),
        padCell(formatDisplayDate(item?.CREATED_ON), widths.createdOn),
        padCell(item?.SHORT_DESC || "-", widths.shortDesc),
      ].join(" | ")
    )
    .join("\n");

  return `${header.join("\n")}\n\n${tableHeader}\n${body}`;
}

export function buildPaginationSuggestions(rows = []) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return [
    "Show next 10 records",
    "Show next 20 records",
    "Show next 30 records",
  ];
}

export function buildCrSuggestions(query = "", scopeLabel = "", rows = []) {
  const q = cleanString(query).toLowerCase();
  const prefix = scopeLabel ? `${scopeLabel} ` : "";
  const pagination = buildPaginationSuggestions(rows);

  if (q.includes("closed")) {
    return [
      ...pagination,
      `Show ${prefix}closed CR list this week`.replace(/\s+/g, " ").trim(),
      `Show ${prefix}closed CR list this month`.replace(/\s+/g, " ").trim(),
    ];
  }

  if (q.includes("approved")) {
    return [
      ...pagination,
      `Show ${prefix}approved CR list this week`.replace(/\s+/g, " ").trim(),
      `Show ${prefix}approved CR list this month`.replace(/\s+/g, " ").trim(),
    ];
  }

  if (q.includes("open")) {
    return [
      ...pagination,
      `Show ${prefix}open CR list this week`.replace(/\s+/g, " ").trim(),
      `Show ${prefix}open CR list this month`.replace(/\s+/g, " ").trim(),
    ];
  }

  if (q.includes("pending")) {
    return [
      ...pagination,
      `Show ${prefix}pending CR list this week`.replace(/\s+/g, " ").trim(),
      `Show ${prefix}pending CR list this month`.replace(/\s+/g, " ").trim(),
    ];
  }

  return [
    ...pagination,
    `Show ${prefix}CR list created in this week`.replace(/\s+/g, " ").trim(),
    `Show ${prefix}closed CR list this month`.replace(/\s+/g, " ").trim(),
  ];
}

export async function persistAssistantAndTouchSession({
  owner,
  sessionId,
  text,
  summary,
  extracted,
  data,
  responseMeta,
}) {
  await step("save assistant message", () =>
    saveAssistantMessage({
      owner,
      sessionId,
      text,
      summary,
      extracted,
      data,
      responseMeta,
    })
  );

  await step("update ChatSession updatedAt", () =>
    ChatSession.updateOne(
      { _id: sessionId },
      { $set: { updatedAt: new Date() } }
    )
  );
}

// =========================
// CR Status Analytics Helpers
// =========================

export function normalizeStatusValue(value = "") {
  return cleanString(value).toLowerCase().replace(/\s+/g, " ");
}

export function getCrStatus(item = {}) {
  return cleanString(
    item?.STATUS ||
      item?.STATU ||
      item?.CR_STATUS ||
      item?.CHANGEREQUEST_STATUS ||
      item?.STATUS_TEXT ||
      item?.STATUSNAME ||
      item?.STATE ||
      ""
  );
}

export function groupCrStatusCounts(rows = []) {
  const map = new Map();

  for (const row of Array.isArray(rows) ? rows : []) {
    const status = normalizeStatusValue(getCrStatus(row));
    const key = status || "unknown";
    map.set(key, (map.get(key) || 0) + 1);
  }

  return Array.from(map.entries()).map(([status, count]) => ({
    status,
    count,
  }));
}

export function calculatePercentage(count, total) {
  if (!total || total <= 0) return 0;
  return Math.round((count / total) * 100);
}

export function buildStatusDistributionChart(rows = [], meta = {}) {
  const totalCRs = Array.isArray(rows) ? rows.length : 0;
  const grouped = groupCrStatusCounts(rows);

  return {
    type: "status_distribution",
    chartType: "donut",
    title: meta.title || "CR Status Distribution",
    totalCRs,
    filters: meta.filters || {},
    data: grouped.map((item) => ({
      status: item.status,
      count: item.count,
      percentage: calculatePercentage(item.count, totalCRs),
    })),
  };
}
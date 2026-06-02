import { postToSap } from "../../sap/sapWrite.service.js";
import { fetchFromSap } from "../../sap.service.js";

function cleanString(v) {
  return String(v || "").trim();
}

function normalizeUrlNav(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((x) => ({
      URL: cleanString(x?.URL),
      URL_NAME: cleanString(x?.URL_NAME),
    }))
    .filter((x) => x.URL && x.URL_NAME);
}

function validatePayload(payload) {
  const required = [
    "ShortDesc",
    "DeliveryResponsible",
    "Developer",
    "Tester",
    "WorkItemReference",
    "Landscape",
  ];

  const missing = required.filter((k) => !cleanString(payload?.[k]));
  if (missing.length > 0) {
    const err = new Error(`Missing required fields: ${missing.join(", ")}`);
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }
}

function buildCreatePayload(payload) {
  const out = {
    ShortDesc: cleanString(payload.ShortDesc),
    DeliveryResponsible: cleanString(payload.DeliveryResponsible),
    Developer: cleanString(payload.Developer),
    Tester: cleanString(payload.Tester),
    WorkItemReference: cleanString(payload.WorkItemReference),
    Landscape: cleanString(payload.Landscape),
  };

  const reqUrlNav = normalizeUrlNav(payload.REQ_URL_NAV);
  if (reqUrlNav.length > 0) {
    out.REQ_URL_NAV = reqUrlNav;
  }

  return out;
}

function normalizeCreateResponse(raw) {
  const d = raw?.d || {};

  const msgType = cleanString(d.EMsgType);
  const message = cleanString(d.EMsgDesc);
  const changeRequestId = cleanString(d.ESolmanCr);
  const status = cleanString(d.EStatus);

  return {
    ok: msgType !== "E" && Boolean(changeRequestId || msgType === "S"),
    message: message || "Change request created successfully.",
    result: {
      msgType,
      changeRequestId,
      status,
      raw,
    },
  };
}

function mapSapCreateError(err) {
  const message = cleanString(err?.message);
  const lower = message.toLowerCase();

  if (
    err?.status === 501 ||
    lower.includes("create_entity") ||
    lower.includes("not implemented in data provider class")
  ) {
    const e = new Error(
      "The connected SAP service does not support creating change requests through this API."
    );
    e.status = 501;
    e.code = "SAP_CREATE_NOT_IMPLEMENTED";
    e.details = {
      sapMessage: message,
      httpStatus: err?.status || 501,
    };
    throw e;
  }

  if (
    err?.status === 504 ||
    lower.includes("gateway timeout") ||
    lower.includes("timed out")
  ) {
    const e = new Error(
      "SAP request timed out while creating the change request. Please verify in SAP before retrying."
    );
    e.status = 504;
    e.code = "SAP_TIMEOUT";
    e.details = {
      sapMessage: message,
      httpStatus: err?.status || 504,
    };
    throw e;
  }

  if (lower.includes("work item") && lower.includes("already exists")) {
    const e = new Error("Work Item reference already exists");
    e.status = 400;
    e.code = "VALIDATION_FAILED";
    e.details = {
      field: "WorkItemReference",
      sapMessage: message,
      httpStatus: err?.status || 400,
    };
    throw e;
  }

  throw err;
}

function escapeODataString(value) {
  return cleanString(value).replace(/'/g, "''");
}

function normalizeCrDetailsResponse(raw) {
  const results = Array.isArray(raw?.d?.results) ? raw.d.results : [];
  return results;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatSapYmd(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  return addDays(x, diff);
}

function startOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function endOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

function monthNameToIndex(name) {
  const months = {
    january: 0,
    february: 1,
    march: 2,
    april: 3,
    may: 4,
    june: 5,
    july: 6,
    august: 7,
    september: 8,
    october: 9,
    november: 10,
    december: 11,
  };

  return months[String(name || "").toLowerCase()] ?? -1;
}

function parseUserDate(input) {
  const s = cleanString(input);
  if (!s) return null;

  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  const native = new Date(s);
  return Number.isNaN(native.getTime()) ? null : native;
}

function resolveCrDateRange({
  fromDate,
  toDate,
  dateText,
  now = new Date(),
}) {
  const today = startOfDay(now);

  if (cleanString(fromDate) && cleanString(toDate)) {
    return {
      from: cleanString(fromDate),
      to: cleanString(toDate),
      source: "explicit",
    };
  }

  const q = cleanString(dateText).toLowerCase();

  if (!q) return null;

  if (q.includes("today")) {
    return {
      from: formatSapYmd(today),
      to: formatSapYmd(today),
      source: "today",
    };
  }

  if (q.includes("yesterday")) {
    const y = addDays(today, -1);
    return {
      from: formatSapYmd(y),
      to: formatSapYmd(y),
      source: "yesterday",
    };
  }

  if (q.includes("this week")) {
    const s = startOfWeek(today);
    return {
      from: formatSapYmd(s),
      to: formatSapYmd(today),
      source: "this_week",
    };
  }

  if (q.includes("this month")) {
    const s = startOfMonth(today);
    return {
      from: formatSapYmd(s),
      to: formatSapYmd(today),
      source: "this_month",
    };
  }

  if (q.includes("last month")) {
    const ref = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    return {
      from: formatSapYmd(startOfMonth(ref)),
      to: formatSapYmd(endOfMonth(ref)),
      source: "last_month",
    };
  }

  if (q.includes("this year")) {
    return {
      from: formatSapYmd(new Date(today.getFullYear(), 0, 1)),
      to: formatSapYmd(today),
      source: "this_year",
    };
  }

  let m = q.match(/last\s+(\d+)\s+days?/);
  if (m) {
    const n = Number(m[1]);
    const s = addDays(today, -(n - 1));
    return {
      from: formatSapYmd(s),
      to: formatSapYmd(today),
      source: "last_days",
    };
  }

  m = q.match(/last\s+(\d+)\s+cr/);
  if (m) {
    return {
      top: Number(m[1]),
      source: "last_n",
    };
  }

  m = q.match(/(?:from|created from)\s+(.+?)\s+(?:to|-)\s+(.+)/);
  if (m) {
    const from = parseUserDate(m[1]);
    const to = parseUserDate(m[2]);
    if (from && to) {
      return {
        from: formatSapYmd(startOfDay(from)),
        to: formatSapYmd(startOfDay(to)),
        source: "from_to",
      };
    }
  }

  m = q.match(/(?:from|created from)\s+(.+?)\s+today/);
  if (m) {
    const from = parseUserDate(m[1]);
    if (from) {
      return {
        from: formatSapYmd(startOfDay(from)),
        to: formatSapYmd(today),
        source: "from_today",
      };
    }
  }

  m = q.match(/created\s+on\s+(.+)/);
  if (m) {
    const d = parseUserDate(m[1]);
    if (d) {
      return {
        from: formatSapYmd(startOfDay(d)),
        to: formatSapYmd(startOfDay(d)),
        source: "created_on",
      };
    }
  }

  m = q.match(
    /\b(?:in\s+the\s+month\s+of|month\s+of|for)?\s*(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{4})\b/
  );
  if (m) {
    const monthIndex = monthNameToIndex(m[1]);
    const year = Number(m[2]);

    if (monthIndex >= 0) {
      const s = new Date(year, monthIndex, 1);
      const e = new Date(year, monthIndex + 1, 0);
      return {
        from: formatSapYmd(s),
        to: formatSapYmd(e),
        source: "month_name_with_year",
      };
    }
  }

  let monthMatch = q.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b(?:\s+(\d{4}))?/
  );
  if (monthMatch) {
    const monthIndex = monthNameToIndex(monthMatch[1]);
    const year = Number(monthMatch[2] || today.getFullYear());

    if (monthIndex >= 0) {
      const s = new Date(year, monthIndex, 1);
      const e = new Date(year, monthIndex + 1, 0);
      return {
        from: formatSapYmd(s),
        to: formatSapYmd(e),
        source: "month_name",
      };
    }
  }

  let yearMatch = q.match(/\b(?:in\s+the\s+year\s+of|year\s+of|for)\s+(20\d{2})\b/);
  if (yearMatch) {
    const year = Number(yearMatch[1]);
    return {
      from: formatSapYmd(new Date(year, 0, 1)),
      to: formatSapYmd(new Date(year, 11, 31)),
      source: "year_phrase",
    };
  }

  yearMatch = q.match(/\bin\s+(20\d{2})\b/);
  if (
    yearMatch &&
    /\b(cr|change request|status)\b/.test(q) &&
    !q.match(/\d{4}-\d{2}-\d{2}/) &&
    !q.match(/\d{8}/) &&
    !monthMatch
  ) {
    const year = Number(yearMatch[1]);
    return {
      from: formatSapYmd(new Date(year, 0, 1)),
      to: formatSapYmd(new Date(year, 11, 31)),
      source: "year_in_phrase",
    };
  }

  yearMatch = q.match(/\b(20\d{2})\b/);
  if (
    yearMatch &&
    !q.match(/\d{4}-\d{2}-\d{2}/) &&
    !q.match(/\d{8}/) &&
    !monthMatch
  ) {
    const year = Number(yearMatch[1]);
    return {
      from: formatSapYmd(new Date(year, 0, 1)),
      to: formatSapYmd(new Date(year, 11, 31)),
      source: "year_only",
    };
  }

  const direct = parseUserDate(q);
  if (direct) {
    return {
      from: formatSapYmd(startOfDay(direct)),
      to: formatSapYmd(startOfDay(direct)),
      source: "direct_date",
    };
  }

  return null;
}

function getDefaultCrRange(now = new Date(), days = 7) {
  const today = startOfDay(now);
  const from = addDays(today, -(days - 1));
  return {
    from: formatSapYmd(from),
    to: formatSapYmd(today),
    source: `default_last_${days}_days`,
  };
}

function normalizeStatusValue(value) {
  return cleanString(value).toLowerCase().replace(/\s+/g, " ");
}

function normalizeCreatedByValue(value) {
  return cleanString(value).toUpperCase();
}

function matchesRequestedStatus(item, requestedStatus) {
  const wanted = normalizeStatusValue(requestedStatus);
  if (!wanted) return true;

  const actual = normalizeStatusValue(item?.STATUS);

  if (actual === wanted) return true;

  const aliases = {
    approved: ["approved", "authorized", "authorized for import"],
    open: ["open", "new", "created"],
    closed: ["closed", "completed", "successfully tested"],
    rejected: ["rejected"],
    pending: ["pending"],
    "in progress": [
      "in progress",
      "under implementation",
      "implementation",
      "in process",
    ],
    "under implementation": [
      "under implementation",
      "in progress",
      "implementation",
    ],
    completed: ["completed", "closed", "successfully tested"],
    success: ["success", "successful", "successfully tested"],
  };

  const allowed = aliases[wanted] || [wanted];
  return allowed.includes(actual);
}

function matchesCreatedBy(item, requestedCreatedBy) {
  const wanted = normalizeCreatedByValue(requestedCreatedBy);
  if (!wanted) return true;

  const actual = normalizeCreatedByValue(
    item?.CREATED_BY ||
      item?.ERNAM ||
      item?.CREATEDBY ||
      item?.CREATOR ||
      item?.AUTHOR ||
      item?.CREATEDBYNAME ||
      item?.CREATED_BY_NAME ||
      item?.USER_NAME ||
      item?.USERNAME ||
      item?.SAP_USER ||
      item?.LAST_CHANGED_BY ||
      ""
  );

  if (!actual) {
    return false;
  }

  return actual === wanted;
}

function isExcludedStatus(item, excludeStatuses = []) {
  const actual = normalizeStatusValue(item?.STATUS);
  if (!actual || !Array.isArray(excludeStatuses) || excludeStatuses.length === 0) {
    return false;
  }

  return excludeStatuses
    .map((status) => normalizeStatusValue(status))
    .filter(Boolean)
    .includes(actual);
}

function buildCrListRelativePath({
  processType,
  triggerAll = "X",
  fromDate,
  toDate,
  status,
  createdBy,
  dateText,
  top,
  skip = 0,
  orderBy = "CREATED_ON desc",
}) {
  const cleanProcessType = cleanString(processType);
  const cleanTriggerAll = cleanString(triggerAll) || "X";
  const cleanStatus = cleanString(status);
  const cleanCreatedBy = normalizeCreatedByValue(createdBy);
  const cleanOrderBy = cleanString(orderBy) || "CREATED_ON desc";

  if (!cleanProcessType) {
    const err = new Error("processType is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  let resolved = resolveCrDateRange({ fromDate, toDate, dateText });
  let finalTop = Number(top) || null;
  let finalSkip = Math.max(0, Number(skip) || 0);

  if (!resolved && finalTop) {
    resolved = getDefaultCrRange(new Date(), 30);
  }

  if (!resolved) {
    resolved = getDefaultCrRange(new Date(), cleanStatus || cleanCreatedBy ? 30 : 7);
  }

  const parts = [
    `PROCESS_TYPE eq '${escapeODataString(cleanProcessType)}'`,
    `TRIGGER_ALL eq '${escapeODataString(cleanTriggerAll)}'`,
  ];

  if (cleanStatus) {
    parts.push(`STATUS eq '${escapeODataString(cleanStatus)}'`);
  }

  if (resolved?.top && !finalTop) {
    finalTop = resolved.top;
    resolved = {
      ...getDefaultCrRange(new Date(), 30),
      top: finalTop,
      source: "last_n_with_default_30_day_window",
    };
  }

  if (resolved?.from && resolved?.to) {
    parts.push(`FROM_DATE eq '${escapeODataString(resolved.from)}'`);
    parts.push(`TO_DATE eq '${escapeODataString(resolved.to)}'`);
  }

  const params = [`$filter=${encodeURIComponent(parts.join(" and "))}`];

  if (cleanOrderBy) {
    params.push(`$orderby=${encodeURIComponent(cleanOrderBy)}`);
  }

  if (finalTop && Number.isFinite(finalTop) && finalTop > 0) {
    params.push(`$top=${finalTop}`);
  }

  if (finalSkip > 0) {
    params.push(`$skip=${finalSkip}`);
  }

  return {
    relativePath: `ZEX_OutputSet?${params.join("&")}`,
    resolvedRange: resolved || null,
    top: finalTop,
    skip: finalSkip,
    orderBy: cleanOrderBy,
    createdBy: cleanCreatedBy,
  };
}

export async function createSolmanChangeRequest({ system, sapAuth, payload }) {
  validatePayload(payload);

  const body = buildCreatePayload(payload);

  try {
    const raw = await postToSap(
      {
        system,
        relativePath:
          "/sap/opu/odata/sap/ZCR_CREATION_CHARM_SRV/ZChange_requestSet",
        body,
      },
      sapAuth
    );

    return normalizeCreateResponse(raw);
  } catch (err) {
    mapSapCreateError(err);
  }
}

export async function getSolmanChangeRequestDetailsById({
  system,
  sapAuth,
  objectId,
  processType = "",
}) {
  const cleanObjectId = cleanString(objectId);
  const cleanProcessType = cleanString(processType) || "YMHF";

  if (!cleanObjectId) {
    const err = new Error("objectId is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const filter = `$filter=OBJECT_ID eq '${escapeODataString(
    cleanObjectId
  )}' and PROCESS_TYPE eq '${escapeODataString(cleanProcessType)}'`;

  const relativePath = `ZEX_OutputSet?${filter}`;

  const raw = await fetchFromSap(
    {
      system,
      service: { serviceName: "ZCR_DETAILS_SRV" },
      relativePath,
    },
    sapAuth
  );

  const results = normalizeCrDetailsResponse(raw);

  return {
    ok: true,
    message:
      results.length > 0
        ? `Found ${results.length} change request record(s).`
        : `No details found for CR ${cleanObjectId}.`,
    result: {
      objectId: cleanObjectId,
      processType: cleanProcessType,
      count: results.length,
      results,
      raw,
    },
  };
}

export async function listSolmanChangeRequestsByDateRange({
  system,
  sapAuth,
  processType,
  fromDate,
  toDate,
  triggerAll = "X",
  status = "",
  excludeStatuses = [],
  statusMode = "",
  createdBy = "",
  dateText = "",
  top = null,
  skip = 0,
  orderBy = "CREATED_ON desc",
}) {
  const cleanProcessType = cleanString(processType);
  const cleanStatus = cleanString(status);
  const cleanStatusMode = cleanString(statusMode);
  const cleanCreatedBy = normalizeCreatedByValue(createdBy);

  if (!cleanProcessType) {
    const err = new Error("processType is required.");
    err.status = 400;
    err.code = "VALIDATION_FAILED";
    throw err;
  }

  const shouldApplyExactStatusInSap = Boolean(cleanStatus && cleanStatusMode !== "pending");

  const built = buildCrListRelativePath({
    processType: cleanProcessType,
    triggerAll,
    fromDate,
    toDate,
    status: shouldApplyExactStatusInSap ? cleanStatus : "",
    createdBy: cleanCreatedBy,
    dateText,
    top,
    skip,
    orderBy,
  });

  const raw = await fetchFromSap(
    {
      system,
      service: { serviceName: "ZCR_DETAILS_SRV" },
      relativePath: built.relativePath,
    },
    sapAuth
  );

  let results = normalizeCrDetailsResponse(raw);

  if (cleanStatusMode === "pending") {
    results = results.filter((item) => !isExcludedStatus(item, excludeStatuses));
  } else if (cleanStatus) {
    results = results.filter((item) => matchesRequestedStatus(item, cleanStatus));
  }

  if (cleanCreatedBy) {
    results = results.filter((item) => matchesCreatedBy(item, cleanCreatedBy));
  }

  return {
    ok: true,
    message:
      results.length > 0
        ? `Found ${results.length} change request(s).`
        : "No change requests found.",
    result: {
      processType: cleanProcessType,
      triggerAll: cleanString(triggerAll) || "X",
      fromDate: built.resolvedRange?.from || cleanString(fromDate),
      toDate: built.resolvedRange?.to || cleanString(toDate),
      status: cleanStatus,
      statusMode: cleanStatusMode,
      createdBy: cleanCreatedBy,
      excludeStatuses: Array.isArray(excludeStatuses) ? excludeStatuses : [],
      top: built.top || top || null,
      skip: built.skip || 0,
      orderBy: built.orderBy,
      nextSkip:
        (built.skip || 0) +
        Math.max(
          0,
          Number.isFinite(Number(built.top || top)) ? Number(built.top || top) : results.length
        ),
      count: results.length,
      results,
      raw,
    },
  };
}
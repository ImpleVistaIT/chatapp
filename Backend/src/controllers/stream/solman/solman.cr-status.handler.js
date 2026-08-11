import { listSolmanChangeRequestsByDateRange } from "../../../services/systems/solman/charm.service.js";
import {
  buildCrSuggestions,
  buildStatusDistributionChart,
  buildSolmanAppliedFiltersSummary,
  cleanString,
  getSolmanCrStatusMaxRows,
  inferCreatedByFilterFromQuery,
  inferDateRangeFromQuery,
  persistAssistantAndTouchSession,
  pickCrListEntities,
  toCrDetailsArray,
} from "./solman.shared.js";
import { step } from "../stream.shared.js";

const CR_STATUS_LOOKBACK_DAYS = 730;
const CR_STATUS_MAX_ROWS = getSolmanCrStatusMaxRows();

function resolveCurrentSolmanUsername(context) {
  return cleanString(
    context?.effectiveSapUser ||
      context?.sapAuth?.username ||
      context?.sapAuth?.user ||
      context?.sapAuth?.sapUser ||
      context?.sapAuth?.USER ||
      ""
  ).toUpperCase();
}

function dedupeRowsByCrNumber(rows = []) {
  const seen = new Set();

  return rows.filter((item) => {
    const crNumber = cleanString(item?.OBJECT_ID || item?.OBJ_ID || "");
    if (!crNumber) return true;
    if (seen.has(crNumber)) return false;
    seen.add(crNumber);
    return true;
  });
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

function formatYmd(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

function toSapPageCount(result) {
  const rawRows = result?.result?.raw?.d?.results;
  return Array.isArray(rawRows) ? rawRows.length : 0;
}

function normalizeOrderByForStablePaging(orderBy = "") {
  const value = cleanString(orderBy) || "CREATED_ON desc";
  const lower = value.toLowerCase();

  if (lower.includes("object_id")) return value;

  return `${value},OBJECT_ID desc`;
}

function getDefaultCrStatusRange(now = new Date()) {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(today);
  from.setDate(from.getDate() - CR_STATUS_LOOKBACK_DAYS + 1);

  return {
    fromDate: formatYmd(from),
    toDate: formatYmd(today),
  };
}

async function fetchAllMatchingCrRows({
  system,
  sapAuth,
  listInput,
  resolvedCreatedBy,
  requestFromDate,
  requestToDate,
  query,
}) {
  const defaultRange = getDefaultCrStatusRange();
  const fromDate = cleanString(requestFromDate) || defaultRange.fromDate;
  const toDate = cleanString(requestToDate) || defaultRange.toDate;

  const pageResult = await listSolmanChangeRequestsByDateRange({
    system,
    sapAuth,
    processType: listInput.processType,
    triggerAll: listInput.triggerAll || "X",
    fromDate,
    toDate,
    status: listInput.status || "",
    excludeStatuses: listInput.excludeStatuses || [],
    statusMode: listInput.statusMode || "",
    dateText: listInput.dateText || query,
    createdBy: resolvedCreatedBy || "",
    top: CR_STATUS_MAX_ROWS,
    skip: 0,
    orderBy: normalizeOrderByForStablePaging(listInput.orderBy),
  });

  if (pageResult?.ok === false) {
    return pageResult;
  }

  const aggregated = dedupeRowsByCrNumber(toCrDetailsArray(pageResult));

  return {
    ok: true,
    rows: aggregated,
    pages: 1,
    fromDate,
    toDate,
    truncated: false,
  };
}

async function fetchAllCrRowsForStatusChart({
  system,
  sapAuth,
  listInput,
  resolvedCreatedBy,
  query,
  fromDate,
  toDate,
}) {
  const aggregated = [];
  let currentSkip = 0;
  let pages = 0;
  const pageSize = 200;
  const maxPages = 500;

  while (pages < maxPages) {
    const pageResult = await listSolmanChangeRequestsByDateRange({
      system,
      sapAuth,
      processType: listInput.processType,
      triggerAll: listInput.triggerAll || "X",
      fromDate: fromDate || "",
      toDate: toDate || "",
      status: listInput.status || "",
      excludeStatuses: listInput.excludeStatuses || [],
      statusMode: listInput.statusMode || "",
      dateText: listInput.dateText || query,
      createdBy: resolvedCreatedBy || "",
      top: pageSize,
      skip: currentSkip,
      orderBy: normalizeOrderByForStablePaging(listInput.orderBy),
    });

    if (pageResult?.ok === false) {
      return pageResult;
    }

    const pageRows = toCrDetailsArray(pageResult);
    if (Array.isArray(pageRows) && pageRows.length > 0) {
      aggregated.push(...pageRows);
    }

    pages += 1;

    if (toSapPageCount(pageResult) < pageSize) {
      break;
    }

    currentSkip += pageSize;
  }

  return {
    ok: true,
    rows: aggregated,
    pages,
    truncated: pages >= maxPages,
  };
}

export async function handleCrStatusDistribution(context) {
  const {
    sse,
    owner,
    query,
    session,
    system,
    sapAuth,
    effectiveSystemId,
    effectiveSapUser,
    classified,
  } = context;

  const listInput = pickCrListEntities(classified?.entities || {}, query);
  const inferredCreatedBy = inferCreatedByFilterFromQuery(
    query,
    classified?.entities || {}
  );

  const inferredDateRange =
    inferDateRangeFromQuery(listInput.dateText || query) || {};

  const isSelfRequest =
    cleanString(listInput.createdBy).toUpperCase() === "ME" ||
    cleanString(inferredCreatedBy?.createdBy).toUpperCase() === "ME" ||
    cleanString(listInput.createdByMode).toLowerCase() === "self" ||
    cleanString(inferredCreatedBy?.createdByMode).toLowerCase() === "self";

  const resolvedCreatedBy = isSelfRequest
    ? resolveCurrentSolmanUsername(context)
    : cleanString(listInput.createdBy || inferredCreatedBy?.createdBy || "");

  if (!cleanString(listInput.processType)) {
    const message =
      "Which landscape would you like to analyze for CR status distribution?";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user to choose a landscape for CR status analytics.",
      extracted: {
        system: "solman",
        intent: "cr_status_distribution",
        pending: true,
        filters: {
          ...listInput,
          createdBy: resolvedCreatedBy || "",
        },
      },
      data: {
        missingFields: ["processType"],
        action: {
          type: "quick_replies",
          options: [
            { label: "ROW", value: "ROW" },
            { label: "INDIA", value: "INDIA" },
          ],
        },
        pendingAction: {
          system: "solman",
          intent: "cr_status_distribution",
          query,
          filters: {
            ...listInput,
            createdBy: resolvedCreatedBy || "",
          },
        },
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.cr_status_distribution",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "needs_input",
      },
    });

    sse.send("error", {
      ok: false,
      status: "needs_input",
      message,
      missingFields: ["processType"],
      action: {
        type: "quick_replies",
        options: [
          { label: "ROW", value: "ROW" },
          { label: "INDIA", value: "INDIA" },
        ],
      },
      pendingAction: {
        system: "solman",
        intent: "cr_status_distribution",
        query,
        filters: {
          ...listInput,
          createdBy: resolvedCreatedBy || "",
        },
      },
    });

    return sse.end();
  }

  sse.send("phase", {
    phase: "executing",
    message: "Calculating CR status distribution from Solution Manager...",
  });

  const requestFromDate = listInput.fromDate || inferredDateRange.fromDate || "";
  const requestToDate = listInput.toDate || inferredDateRange.toDate || "";

  console.log("[SOLMAN] status date filters:", {
    query,
    fromDate: cleanString(requestFromDate),
    toDate: cleanString(requestToDate),
    status: cleanString(listInput.status || ""),
    statusMode: cleanString(listInput.statusMode || ""),
    createdBy: cleanString(resolvedCreatedBy || ""),
    businessScope: cleanString(listInput.businessScope || ""),
  });

  const fullFetch = await step("fetchAllMatchingCrRows", () =>
    fetchAllMatchingCrRows({
      system,
      sapAuth,
      listInput,
      resolvedCreatedBy,
      requestFromDate,
      requestToDate,
      query,
    })
  );

  if (fullFetch?.ok === false) {
    const message = fullFetch?.message || "Failed to fetch change requests";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "CR status distribution failed.",
      extracted: {
        system: "solman",
        intent: "cr_status_distribution",
        filters: {
          ...listInput,
          createdBy: resolvedCreatedBy || "",
        },
      },
      data: {
        raw: fullFetch?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.cr_status_distribution",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "execution_failed",
      },
    });

    sse.send("error", {
      ok: false,
      status: "execution_failed",
      message,
      raw: fullFetch?.result?.raw || null,
    });

    return sse.end();
  }

  let rows = Array.isArray(fullFetch?.rows) ? fullFetch.rows : [];
  rows = dedupeRowsByCrNumber(rows);

  const effectiveFromDate =
    cleanString(fullFetch?.fromDate || requestFromDate) || "";
  const effectiveToDate =
    cleanString(fullFetch?.toDate || requestToDate) || "";

  const chartFetch = await step("fetchAllCrRowsForStatusChart", () =>
    fetchAllCrRowsForStatusChart({
      system,
      sapAuth,
      listInput,
      resolvedCreatedBy,
      query,
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
    })
  );

  if (chartFetch?.ok === false) {
    const message = chartFetch?.message || "Failed to fetch change requests";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "CR status distribution failed.",
      extracted: {
        system: "solman",
        intent: "cr_status_distribution",
        filters: {
          ...listInput,
          createdBy: resolvedCreatedBy || "",
        },
      },
      data: {
        raw: chartFetch?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.cr_status_distribution",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "execution_failed",
      },
    });

    sse.send("error", {
      ok: false,
      status: "execution_failed",
      message,
      raw: chartFetch?.result?.raw || null,
    });

    return sse.end();
  }

  const chartRows = dedupeRowsByCrNumber(Array.isArray(chartFetch?.rows) ? chartFetch.rows : rows);

  const chart = buildStatusDistributionChart(chartRows, {
    title: "CR Status Distribution",
    filters: {
      businessScope: listInput.businessScope,
      processType: listInput.processType,
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
      createdBy: resolvedCreatedBy || "",
    },
  });

  const reply = {
    type: "status_distribution",
    chartType: "donut",
    title: "CR Status Distribution",
    totalCRs: chart.totalCRs,
    data: chart.data,
  };

  const responseData = {
    viewType: "solman_cr_status",
    rows: rows.slice(0, CR_STATUS_MAX_ROWS),
    tableRecords: rows.slice(0, CR_STATUS_MAX_ROWS),
    allCRRecords: chartRows,
    chart: reply,
    statusDistribution: chart,
    dateRange: {
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
    },
    limit: CR_STATUS_MAX_ROWS,
  };

  const summary =
    buildSolmanAppliedFiltersSummary({
      status: result?.result?.status || listInput.status,
      statusMode: result?.result?.statusMode || listInput.statusMode,
      excludeStatuses: result?.result?.excludeStatuses || listInput.excludeStatuses || [],
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
      createdBy: resolvedCreatedBy || "",
      businessScope: listInput.businessScope,
    }) || "No records found for the given criteria.";

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: summary,
    summary,
    extracted: {
      system: "solman",
      intent: "cr_status_distribution",
      filters: {
        businessScope: listInput.businessScope,
        processType: listInput.processType,
        fromDate: effectiveFromDate,
        toDate: effectiveToDate,
        status: listInput.status || "",
        statusMode: listInput.statusMode || "",
        createdBy: resolvedCreatedBy || "",
        dateText: listInput.dateText || query,
      },
    },
    data: responseData,
    suggestions: buildCrSuggestions(query, listInput.businessScope, chartRows),
    responseMeta: {
      ok: true,
      kind: "chart",
      executor: "solman.cr_status_distribution",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      pagesFetched: Number(chartFetch?.pages || 1),
      truncated: Boolean(chartFetch?.truncated),
      chart,
    },
  });

  sse.send("reply", {
    ok: true,
    sessionId: String(session._id),
    systemId: effectiveSystemId,
    sapUser: effectiveSapUser,
    ...reply,
    suggestions: buildCrSuggestions(query, listInput.businessScope, chartRows),
    summary,
    data: responseData,
  });

  sse.send("done", { ok: true });
  return sse.end();
}

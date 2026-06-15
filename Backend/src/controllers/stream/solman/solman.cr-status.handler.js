import { listSolmanChangeRequestsByDateRange } from "../../../services/systems/solman/charm.service.js";
import {
  buildStatusDistributionChart,
  cleanString,
  inferCreatedByFilterFromQuery,
  inferDateRangeFromQuery,
  persistAssistantAndTouchSession,
  pickCrListEntities,
  toCrDetailsArray,
} from "./solman.shared.js";
import { step } from "../stream.shared.js";

const ANALYTICS_PAGE_SIZE = 200;
const ANALYTICS_MAX_PAGES = 500;

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

function buildStatusDistributionSummary(chart) {
  if (!chart || !Array.isArray(chart.data) || chart.data.length === 0) {
    return "No change requests found for the selected filters.";
  }

  const parts = chart.data.map((item) => {
    const status = item.status || "unknown";
    return `${item.percentage}% are ${status}`;
  });

  return `Out of ${chart.totalCRs} Change Requests, ${parts.join(", ")}.`;
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

async function fetchAllMatchingCrRows({
  system,
  sapAuth,
  listInput,
  resolvedCreatedBy,
  requestFromDate,
  requestToDate,
  query,
}) {
  const aggregated = [];
  let currentSkip = 0;
  let effectiveFromDate = requestFromDate;
  let effectiveToDate = requestToDate;
  let pages = 0;

  while (pages < ANALYTICS_MAX_PAGES) {
    const pageResult = await listSolmanChangeRequestsByDateRange({
      system,
      sapAuth,
      processType: listInput.processType,
      triggerAll: listInput.triggerAll || "X",
      fromDate: effectiveFromDate,
      toDate: effectiveToDate,
      status: listInput.status || "",
      excludeStatuses: listInput.excludeStatuses || [],
      statusMode: listInput.statusMode || "",
      dateText: listInput.dateText || query,
      createdBy: resolvedCreatedBy || "",
      top: ANALYTICS_PAGE_SIZE,
      skip: currentSkip,
      orderBy: normalizeOrderByForStablePaging(listInput.orderBy),
    });

    if (pageResult?.ok === false) {
      return pageResult;
    }

    if (!effectiveFromDate) {
      effectiveFromDate = cleanString(pageResult?.result?.fromDate || "");
    }

    if (!effectiveToDate) {
      effectiveToDate = cleanString(pageResult?.result?.toDate || "");
    }

    const pageRows = toCrDetailsArray(pageResult);
    if (Array.isArray(pageRows) && pageRows.length > 0) {
      aggregated.push(...pageRows);
    }

    const sapPageCount = toSapPageCount(pageResult);
    pages += 1;

    if (sapPageCount < ANALYTICS_PAGE_SIZE) {
      break;
    }

    currentSkip += ANALYTICS_PAGE_SIZE;
  }

  return {
    ok: true,
    rows: aggregated,
    pages,
    fromDate: effectiveFromDate,
    toDate: effectiveToDate,
    truncated: pages >= ANALYTICS_MAX_PAGES,
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

  const chart = buildStatusDistributionChart(rows, {
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

  const summary = buildStatusDistributionSummary(chart);

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
    data: reply,
    responseMeta: {
      ok: true,
      kind: "chart",
      executor: "solman.cr_status_distribution",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      pagesFetched: Number(fullFetch?.pages || 0),
      ...(fullFetch?.truncated ? { truncated: true } : {}),
      chart,
    },
  });

  sse.send("reply", {
    ok: true,
    sessionId: String(session._id),
    systemId: effectiveSystemId,
    sapUser: effectiveSapUser,
    ...reply,
    summary,
  });

  sse.send("done", { ok: true });
  return sse.end();
}

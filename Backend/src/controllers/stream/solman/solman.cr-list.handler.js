import { listSolmanChangeRequestsByDateRange } from "../../../services/systems/solman/charm.service.js";
import {
  buildCrSuggestions,
  buildStatusDistributionChart,
  cleanString,
  formatCrListReply,
  isNextPageQuery,
  persistAssistantAndTouchSession,
  pickCrListEntities,
  toCrDetailsArray,
} from "./solman.shared.js";
import { step } from "../stream.shared.js";

const LIST_CHART_PAGE_SIZE = 200;
const LIST_CHART_MAX_PAGES = 500;

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

function getCrUniqueKey(item = {}) {
  return cleanString(item?.OBJECT_ID || item?.OBJ_ID || "");
}

function dedupeByCrNumber(rows = []) {
  const seen = new Set();
  const deduped = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    const key = getCrUniqueKey(row);
    if (!key) continue;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(row);
  }

  return deduped;
}

function shouldIncludeChartForCrList(query = "") {
  const q = cleanString(query).toLowerCase();

  if (!q) return false;

  const explicitAnalyticsTerms = [
    "status distribution",
    "status breakdown",
    "status analytics",
    "status chart",
    "pie chart",
    "donut chart",
    "percentage distribution",
    "grouped by status",
    "group by status",
    "cr status distribution",
    "status percentage distribution",
  ];

  if (explicitAnalyticsTerms.some((term) => q.includes(term))) {
    return false;
  }

  return (
    q.includes("show cr status") ||
    q.includes("show crs") ||
    q.includes("list change requests") ||
    q.includes("show change requests") ||
    q.includes("cr list") ||
    q.includes("list crs") ||
    q.includes("change request list")
  );
}

export async function handleCrList(context) {
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

  let resolvedCreatedBy = cleanString(listInput.createdBy || "");

  if (listInput.createdByMode === "self") {
    resolvedCreatedBy = resolveCurrentSolmanUsername(context);

    if (!resolvedCreatedBy) {
      const message =
        "I couldn't determine the current logged-in Solution Manager username for filtering change requests created by you.";

      await persistAssistantAndTouchSession({
        owner,
        sessionId: session._id,
        text: message,
        summary: "Unable to resolve current logged-in Solman username.",
        extracted: {
          system: "solman",
          intent: "list_change_requests",
          filters: {
            businessScope: listInput.businessScope,
            processType: listInput.processType,
            status: listInput.status,
            dateText: listInput.dateText,
            triggerAll: listInput.triggerAll || "X",
            top: listInput.top,
            skip: listInput.skip,
            nextSkip: listInput.nextSkip,
            orderBy: listInput.orderBy,
            fromDate: listInput.fromDate,
            toDate: listInput.toDate,
            statusMode: listInput.statusMode,
            excludeStatuses: listInput.excludeStatuses,
            createdBy: listInput.createdBy || "",
            createdByMode: listInput.createdByMode || "",
          },
        },
        data: null,
        responseMeta: {
          ok: false,
          kind: "stream",
          executor: "solman.list_change_requests",
          systemId: effectiveSystemId,
          sapUser: effectiveSapUser,
          status: "execution_failed",
        },
      });

      sse.send("error", {
        ok: false,
        status: "execution_failed",
        message,
      });
      return sse.end();
    }
  }

  if (!cleanString(listInput.processType)) {
    const message = "Which landscape would you like to view the Change Requests from?";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user to choose a landscape for listing change requests.",
      extracted: {
        system: "solman",
        intent: "list_change_requests",
        pending: true,
        filters: {
          businessScope: listInput.businessScope,
          processType: listInput.processType,
          status: listInput.status,
          dateText: listInput.dateText,
          triggerAll: listInput.triggerAll || "X",
          top: listInput.top,
          skip: listInput.skip,
          nextSkip: listInput.nextSkip,
          orderBy: listInput.orderBy,
          fromDate: listInput.fromDate,
          toDate: listInput.toDate,
          statusMode: listInput.statusMode,
          excludeStatuses: listInput.excludeStatuses,
          createdBy: resolvedCreatedBy || "",
          createdByMode: listInput.createdByMode || "",
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
          intent: "list_change_requests",
          query,
          filters: {
            businessScope: listInput.businessScope,
            processType: listInput.processType,
            status: listInput.status,
            dateText: listInput.dateText,
            triggerAll: listInput.triggerAll || "X",
            top: listInput.top,
            skip: listInput.skip,
            nextSkip: listInput.nextSkip,
            orderBy: listInput.orderBy,
            fromDate: listInput.fromDate,
            toDate: listInput.toDate,
            statusMode: listInput.statusMode,
            excludeStatuses: listInput.excludeStatuses,
            createdBy: resolvedCreatedBy || "",
            createdByMode: listInput.createdByMode || "",
          },
        },
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.list_change_requests",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "needs_input",
      },
    });

    sse.send("error", {
      ok: false,
      sessionId: String(session._id),
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
        intent: "list_change_requests",
        query,
        filters: {
          businessScope: listInput.businessScope,
          processType: listInput.processType,
          status: listInput.status,
          dateText: listInput.dateText,
          triggerAll: listInput.triggerAll || "X",
          top: listInput.top,
          skip: listInput.skip,
          nextSkip: listInput.nextSkip,
          orderBy: listInput.orderBy,
          fromDate: listInput.fromDate,
          toDate: listInput.toDate,
          statusMode: listInput.statusMode,
          excludeStatuses: listInput.excludeStatuses,
          createdBy: resolvedCreatedBy || "",
          createdByMode: listInput.createdByMode || "",
        },
      },
    });
    return sse.end();
  }

  sse.send("phase", {
    phase: "executing",
    message: "Fetching change requests from Solution Manager...",
  });

  const result = await step("listSolmanChangeRequestsByDateRange", () =>
    listSolmanChangeRequestsByDateRange({
      system,
      sapAuth,
      processType: listInput.processType,
      triggerAll: listInput.triggerAll || "X",
      fromDate: listInput.fromDate || "",
      toDate: listInput.toDate || "",
      status: listInput.status || "",
      excludeStatuses: listInput.excludeStatuses || [],
      statusMode: listInput.statusMode || "",
      dateText: listInput.dateText || query,
      createdBy: resolvedCreatedBy || "",
      top: listInput.top ?? 10,
      skip: listInput.skip || 0,
      orderBy: listInput.orderBy || "CREATED_ON desc",
    })
  );

  if (result?.ok === false) {
    const message = result?.message || "Failed to fetch change requests";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Fetching change requests failed.",
      extracted: {
        system: "solman",
        intent: "list_change_requests",
        filters: {
          businessScope: listInput.businessScope,
          processType: listInput.processType,
          triggerAll: listInput.triggerAll || "X",
          fromDate: listInput.fromDate,
          toDate: listInput.toDate,
          status: listInput.status,
          statusMode: listInput.statusMode,
          excludeStatuses: listInput.excludeStatuses || [],
          createdBy: resolvedCreatedBy || "",
          createdByMode: listInput.createdByMode || "",
          top: listInput.top ?? 10,
          skip: listInput.skip || 0,
          nextSkip: listInput.nextSkip || 0,
          orderBy: listInput.orderBy || "CREATED_ON desc",
        },
      },
      data: {
        raw: result?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.list_change_requests",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "execution_failed",
      },
    });

    sse.send("error", {
      ok: false,
      status: "execution_failed",
      message,
      raw: result?.result?.raw || null,
    });
    return sse.end();
  }

  const rawRows = toCrDetailsArray(result);
  const rows = dedupeByCrNumber(rawRows);
  const responseTop = result?.result?.top ?? listInput.top ?? 10;
  const responseSkip = result?.result?.skip ?? listInput.skip ?? 0;
  const rawRowCount = Array.isArray(rawRows) ? rawRows.length : 0;
  const normalizedTop = Math.max(0, Number(responseTop) || 0);
  const responseNextSkip =
    result?.result?.nextSkip ??
    responseSkip + (normalizedTop > 0 ? normalizedTop : rows.length);
  const hasMore = normalizedTop > 0 ? rawRowCount >= normalizedTop : rawRowCount > 0;
  const noMoreMessage = "No more change requests found.";
  const isNextPageRequest = isNextPageQuery(query);
  const responseDisplayOffset = Math.max(
    0,
    Number(listInput.displayOffset ?? responseSkip) || 0
  );
  const shouldBuildChart = rows.length > 0 && shouldIncludeChartForCrList(query);
  let chart = null;

  if (shouldBuildChart) {
    const chartFromDate = result?.result?.fromDate || listInput.fromDate || "";
    const chartToDate = result?.result?.toDate || listInput.toDate || "";

    const fullChartFetch = await step("fetchAllCrRowsForListChart", () =>
      fetchAllCrRowsForListChart({
        system,
        sapAuth,
        listInput,
        resolvedCreatedBy,
        query,
        fromDate: chartFromDate,
        toDate: chartToDate,
      })
    );

    if (fullChartFetch?.ok !== false) {
      const chartRows = dedupeByCrNumber(fullChartFetch?.rows || []);

      chart = buildStatusDistributionChart(chartRows, {
        title: "CR Status Distribution",
        filters: {
          businessScope: listInput.businessScope,
          processType: result?.result?.processType || listInput.processType,
          triggerAll: result?.result?.triggerAll || listInput.triggerAll || "X",
          fromDate: chartFromDate,
          toDate: chartToDate,
          status: result?.result?.status || listInput.status,
          statusMode: result?.result?.statusMode || listInput.statusMode,
          createdBy: result?.result?.createdBy || resolvedCreatedBy || "",
        },
      });

      chart.pagesFetched = Number(fullChartFetch?.pages || 0);
      if (fullChartFetch?.truncated) {
        chart.truncated = true;
      }
    }
  }

  const responseData = {
    rows,
    ...(chart ? { chart } : {}),
  };

  if (rows.length === 0 && !isNextPageRequest) {
    const noResultsMessage = "No change requests found.";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: noResultsMessage,
      summary: noResultsMessage,
      extracted: {
        system: "solman",
        intent: "list_change_requests",
        filters: {
          businessScope: listInput.businessScope,
          processType: result?.result?.processType || listInput.processType,
          triggerAll: result?.result?.triggerAll || listInput.triggerAll || "X",
          fromDate: result?.result?.fromDate || listInput.fromDate,
          toDate: result?.result?.toDate || listInput.toDate,
          status: result?.result?.status || listInput.status,
          statusMode: result?.result?.statusMode || listInput.statusMode,
          excludeStatuses:
            result?.result?.excludeStatuses || listInput.excludeStatuses || [],
          createdBy: result?.result?.createdBy || resolvedCreatedBy || "",
          createdByMode: listInput.createdByMode || "",
          top: responseTop,
          skip: responseSkip,
          nextSkip: responseNextSkip,
          orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
          dateText: listInput.dateText || query,
        },
      },
      data: responseData,
      responseMeta: {
        ok: true,
        kind: "stream",
        executor: "solman.list_change_requests",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        pagination: {
          top: responseTop,
          skip: responseSkip,
          nextSkip: responseNextSkip,
          orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
          hasMore: false,
        },
      },
    });

    sse.send("reply", {
      ok: true,
      sessionId: String(session._id),
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      reply: noResultsMessage,
      summary: noResultsMessage,
      data: responseData,
      pagination: {
        top: responseTop,
        skip: responseSkip,
        nextSkip: responseNextSkip,
        orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
        hasMore: false,
      },
      suggestions: buildCrSuggestions(query, listInput.businessScope, rows),
      ...(chart ? { chart } : {}),
    });

    sse.send("done", { ok: true });
    return sse.end();
  }

  if (isNextPageRequest && rows.length === 0) {
    const emptyPagination = {
      top: responseTop,
      skip: responseSkip,
      nextSkip: responseNextSkip,
      orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
      hasMore: false,
    };

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: noMoreMessage,
      summary: noMoreMessage,
      extracted: {
        system: "solman",
        intent: "list_change_requests",
        filters: {
          businessScope: listInput.businessScope,
          processType: result?.result?.processType || listInput.processType,
          triggerAll: result?.result?.triggerAll || listInput.triggerAll,
          fromDate: result?.result?.fromDate || listInput.fromDate,
          toDate: result?.result?.toDate || listInput.toDate,
          status: result?.result?.status || listInput.status,
          statusMode: result?.result?.statusMode || listInput.statusMode,
          excludeStatuses:
            result?.result?.excludeStatuses || listInput.excludeStatuses || [],
          createdBy: result?.result?.createdBy || resolvedCreatedBy || "",
          createdByMode: listInput.createdByMode || "",
          top: responseTop,
          skip: responseSkip,
          nextSkip: responseNextSkip,
          orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
          dateText: listInput.dateText || query,
        },
      },
      data: responseData,
      responseMeta: {
        ok: true,
        kind: "stream",
        executor: "solman.list_change_requests",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        pagination: emptyPagination,
        pendingAction: {
          system: "solman",
          intent: "list_change_requests",
          query: listInput.dateText || query,
          filters: {
            businessScope: listInput.businessScope,
            processType: result?.result?.processType || listInput.processType,
            status: result?.result?.status || listInput.status,
            dateText: listInput.dateText || query,
            triggerAll: result?.result?.triggerAll || listInput.triggerAll || "X",
            top: responseTop,
            skip: responseSkip,
            nextSkip: responseNextSkip,
            displayOffset: responseDisplayOffset,
            nextDisplayOffset: responseDisplayOffset + rows.length,
            orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
            fromDate: result?.result?.fromDate || listInput.fromDate,
            toDate: result?.result?.toDate || listInput.toDate,
            statusMode: result?.result?.statusMode || listInput.statusMode,
            excludeStatuses:
              result?.result?.excludeStatuses || listInput.excludeStatuses || [],
            createdBy: result?.result?.createdBy || resolvedCreatedBy || "",
            createdByMode: listInput.createdByMode || "",
          },
        },
      },
    });

    sse.send("reply", {
      ok: true,
      sessionId: String(session._id),
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      reply: noMoreMessage,
      summary: noMoreMessage,
      data: responseData,
      pagination: emptyPagination,
      suggestions: [
        `Show ${listInput.businessScope ? `${listInput.businessScope} ` : ""}CR list this week`
          .replace(/\s+/g, " ")
          .trim(),
      ],
    });

    sse.send("done", { ok: true });
    return sse.end();
  }

  let reply = formatCrListReply(rows, {
    businessScope: listInput.businessScope,
    fromDate: result?.result?.fromDate || listInput.fromDate,
    toDate: result?.result?.toDate || listInput.toDate,
    status: result?.result?.status || listInput.status,
    statusMode: result?.result?.statusMode || listInput.statusMode,
    createdBy: resolvedCreatedBy || "",
    top: responseTop,
    skip: responseSkip,
    displayOffset: responseDisplayOffset,
  });

  if (!hasMore && rows.length > 0) {
    reply = `${reply}\n\n${noMoreMessage}`;
  }

  const persistedPendingAction = {
    system: "solman",
    intent: "list_change_requests",
    query: listInput.dateText || query,
    filters: {
      businessScope: listInput.businessScope,
      processType: result?.result?.processType || listInput.processType,
      status: result?.result?.status || listInput.status,
      dateText: listInput.dateText || query,
      triggerAll: result?.result?.triggerAll || listInput.triggerAll || "X",
      top: responseTop,
      skip: responseSkip,
      nextSkip: responseNextSkip,
      displayOffset: responseDisplayOffset,
      nextDisplayOffset: responseDisplayOffset + rows.length,
      orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
      fromDate: result?.result?.fromDate || listInput.fromDate,
      toDate: result?.result?.toDate || listInput.toDate,
      statusMode: result?.result?.statusMode || listInput.statusMode,
      excludeStatuses: result?.result?.excludeStatuses || listInput.excludeStatuses || [],
      createdBy: result?.result?.createdBy || resolvedCreatedBy || "",
      createdByMode: listInput.createdByMode || "",
    },
  };

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary: result?.message || `Fetched ${rows.length} change request(s).`,
    extracted: {
      system: "solman",
      intent: "list_change_requests",
      filters: {
        businessScope: listInput.businessScope,
        processType: result?.result?.processType || listInput.processType,
        triggerAll: result?.result?.triggerAll || listInput.triggerAll,
        fromDate: result?.result?.fromDate || listInput.fromDate,
        toDate: result?.result?.toDate || listInput.toDate,
        status: result?.result?.status || listInput.status,
        statusMode: result?.result?.statusMode || listInput.statusMode,
        excludeStatuses:
          result?.result?.excludeStatuses || listInput.excludeStatuses || [],
        createdBy: result?.result?.createdBy || resolvedCreatedBy || "",
        createdByMode: listInput.createdByMode || "",
        top: responseTop,
        skip: responseSkip,
        nextSkip: responseNextSkip,
        displayOffset: responseDisplayOffset,
        nextDisplayOffset: responseDisplayOffset + rows.length,
        orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
        dateText: listInput.dateText || query,
      },
    },
    data: responseData,
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.list_change_requests",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      pagination: {
        top: responseTop,
        skip: responseSkip,
        nextSkip: responseNextSkip,
        orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
        hasMore,
      },
      pendingAction: persistedPendingAction,
    },
  });

  sse.send("reply", {
    ok: true,
    sessionId: String(session._id),
    systemId: effectiveSystemId,
    sapUser: effectiveSapUser,
    reply,
    summary: result?.message || `Fetched ${rows.length} change request(s).`,
    data: responseData,
    pagination: {
      top: responseTop,
      skip: responseSkip,
      nextSkip: responseNextSkip,
      orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
      hasMore,
    },
    suggestions: buildCrSuggestions(
      query,
      listInput.businessScope,
      rows
    ),
    ...(chart ? { chart } : {}),
  });

  sse.send("done", { ok: true });
  return sse.end();
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

async function fetchAllCrRowsForListChart({
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

  while (pages < LIST_CHART_MAX_PAGES) {
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
      top: LIST_CHART_PAGE_SIZE,
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

    if (toSapPageCount(pageResult) < LIST_CHART_PAGE_SIZE) {
      break;
    }

    currentSkip += LIST_CHART_PAGE_SIZE;
  }

  return {
    ok: true,
    rows: aggregated,
    pages,
    truncated: pages >= LIST_CHART_MAX_PAGES,
  };
}
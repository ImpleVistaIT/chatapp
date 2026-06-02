import { listSolmanChangeRequestsByDateRange } from "../../../services/systems/solman/charm.service.js";
import {
  buildCrSuggestions,
  cleanString,
  formatCrListReply,
  inferCreatedByFilterFromQuery,
  persistAssistantAndTouchSession,
  pickCrListEntities,
  toCrDetailsArray,
} from "./solman.shared.js";
import { step } from "../stream.shared.js";

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

function normalizeCreatedByForComparison(value = "") {
  return cleanString(value).toUpperCase();
}

function getCrNumber(item = {}) {
  return cleanString(item?.OBJECT_ID || item?.OBJ_ID || "");
}

function dedupeRowsByCrNumber(rows = []) {
  const seen = new Set();

  return rows.filter((item) => {
    const crNumber = getCrNumber(item);
    if (!crNumber) return true;

    if (seen.has(crNumber)) return false;
    seen.add(crNumber);
    return true;
  });
}

export async function handleCrCreatedBy(context) {
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

  const originalQuery =
    cleanString(classified?.entities?.dateText) ||
    cleanString(listInput.dateText) ||
    cleanString(query);

  let resolvedCreatedBy = cleanString(
    listInput.createdBy || inferredCreatedBy.createdBy || ""
  );

  let createdByMode = cleanString(
    listInput.createdByMode || inferredCreatedBy.createdByMode || ""
  );

  if (!createdByMode && resolvedCreatedBy) {
    createdByMode = "explicit";
  }

  const isSelfRequest =
    createdByMode === "self" ||
    normalizeCreatedByForComparison(resolvedCreatedBy) === "ME";

  if (isSelfRequest) {
    resolvedCreatedBy = resolveCurrentSolmanUsername(context);
    createdByMode = "self";

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
          intent: "list_change_requests_by_created_by",
          pending: true,
          filters: {
            businessScope: listInput.businessScope,
            processType: listInput.processType,
            status: listInput.status,
            dateText: originalQuery,
            triggerAll: listInput.triggerAll || "X",
            top: listInput.top,
            skip: listInput.skip,
            nextSkip: listInput.nextSkip,
            orderBy: listInput.orderBy,
            fromDate: listInput.fromDate,
            toDate: listInput.toDate,
            statusMode: listInput.statusMode,
            excludeStatuses: listInput.excludeStatuses,
            createdBy: "ME",
            createdByMode: "self",
          },
        },
        data: null,
        responseMeta: {
          ok: false,
          kind: "stream",
          executor: "solman.list_change_requests_by_created_by",
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
        intent: "list_change_requests_by_created_by",
        pending: true,
        filters: {
          businessScope: listInput.businessScope,
          processType: listInput.processType,
          status: listInput.status,
          dateText: originalQuery,
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
          createdByMode,
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
          intent: "list_change_requests_by_created_by",
          query: originalQuery,
          filters: {
            businessScope: listInput.businessScope,
            processType: listInput.processType,
            status: listInput.status,
            dateText: originalQuery,
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
            createdByMode,
          },
        },
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.list_change_requests_by_created_by",
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
        intent: "list_change_requests_by_created_by",
        query: originalQuery,
        filters: {
          businessScope: listInput.businessScope,
          processType: listInput.processType,
          status: listInput.status,
          dateText: originalQuery,
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
          createdByMode,
        },
      },
    });

    return sse.end();
  }

  sse.send("phase", {
    phase: "executing",
    message:
      createdByMode === "self"
        ? "Fetching your change requests from Solution Manager..."
        : "Fetching change requests created by the specified user from Solution Manager...",
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
      dateText: originalQuery,
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
        intent: "list_change_requests_by_created_by",
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
          createdByMode,
          top: listInput.top ?? 10,
          skip: listInput.skip || 0,
          nextSkip: listInput.nextSkip || 0,
          orderBy: listInput.orderBy || "CREATED_ON desc",
          dateText: originalQuery,
        },
      },
      data: {
        raw: result?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.list_change_requests_by_created_by",
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

  let rows = toCrDetailsArray(result);
  const rawRowCount = Array.isArray(rows) ? rows.length : 0;
  rows = dedupeRowsByCrNumber(rows);

  if (isSelfRequest && rows.length === 0 && Array.isArray(result?.result?.results)) {
    rows = dedupeRowsByCrNumber(result.result.results);
  }

  const responseTop = result?.result?.top ?? listInput.top ?? 10;
  const responseSkip = result?.result?.skip ?? listInput.skip ?? 0;
  const responseDisplayOffset = Math.max(
    0,
    Number(listInput.displayOffset ?? responseSkip) || 0
  );

  const responseNextSkip = Number.isFinite(Number(result?.result?.nextSkip))
    ? Number(result.result.nextSkip)
    : responseSkip + responseTop;

  const hasMoreRows = rawRowCount >= Math.max(1, Number(responseTop) || 10);
  const noMoreMessage = "No more change requests found.";
  const isNextPageRequest = /\b(?:show\s+)?next\s+\d+\b/i.test(cleanString(query));

  const reply = formatCrListReply(rows, {
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

  const summaryMessage =
    rows.length > 0
      ? `Fetched ${rows.length} change request(s).`
      : "No change requests found.";

  const persistedPendingAction = {
    system: "solman",
    intent: "list_change_requests_by_created_by",
    query: originalQuery || query,
    filters: {
      businessScope: listInput.businessScope,
      processType: result?.result?.processType || listInput.processType,
      status: result?.result?.status || listInput.status,
      dateText: originalQuery || query,
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
      createdByMode,
    },
  };

  if (isNextPageRequest && rows.length === 0) {
    const emptyPagination = {
      top: responseTop,
      skip: responseSkip,
      nextSkip: responseNextSkip,
      orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
      hasMoreRows: false,
    };

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: noMoreMessage,
      summary: noMoreMessage,
      extracted: {
        system: "solman",
        intent: "list_change_requests_by_created_by",
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
          createdByMode,
          top: responseTop,
          skip: responseSkip,
          nextSkip: responseNextSkip,
          orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
          dateText: originalQuery || query,
        },
      },
      data: [],
      responseMeta: {
        ok: true,
        kind: "stream",
        executor: "solman.list_change_requests_by_created_by",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        pagination: emptyPagination,
        pendingAction: persistedPendingAction,
      },
    });

    sse.send("reply", {
      ok: true,
      sessionId: String(session._id),
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      reply: noMoreMessage,
      summary: noMoreMessage,
      data: [],
      pagination: emptyPagination,
      suggestions: buildCrSuggestions(originalQuery || query, listInput.businessScope, []),
    });

    sse.send("done", { ok: true });
    return sse.end();
  }

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary: summaryMessage,
    extracted: {
      system: "solman",
      intent: "list_change_requests_by_created_by",
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
        createdByMode,
        top: responseTop,
        skip: responseSkip,
        nextSkip: responseNextSkip,
          displayOffset: responseDisplayOffset,
          nextDisplayOffset: responseDisplayOffset + rows.length,
        orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
        dateText: originalQuery,
      },
    },
    data: rows,
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.list_change_requests_by_created_by",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      pagination: {
        top: responseTop,
        skip: responseSkip,
        nextSkip: responseNextSkip,
        displayOffset: responseDisplayOffset,
        nextDisplayOffset: responseDisplayOffset + rows.length,
        orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
        hasMoreRows,
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
    summary: summaryMessage,
    data: rows,
    pagination: {
      top: responseTop,
      skip: responseSkip,
      nextSkip: responseNextSkip,
      orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
      hasMoreRows,
    },
    suggestions: buildCrSuggestions(
      originalQuery || query,
      listInput.businessScope,
      rows
    ),
  });

  sse.send("done", { ok: true });
  return sse.end();
}
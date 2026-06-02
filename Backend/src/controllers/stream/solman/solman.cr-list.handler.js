import { listSolmanChangeRequestsByDateRange } from "../../../services/systems/solman/charm.service.js";
import {
  buildCrSuggestions,
  cleanString,
  formatCrListReply,
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

  const rows = toCrDetailsArray(result);
  const responseTop = result?.result?.top ?? listInput.top ?? 10;
  const responseSkip = result?.result?.skip ?? listInput.skip ?? 0;
  const responseNextSkip =
    result?.result?.nextSkip ?? responseSkip + (Array.isArray(rows) ? rows.length : 0);

  const reply = formatCrListReply(rows, {
    businessScope: listInput.businessScope,
    fromDate: result?.result?.fromDate || listInput.fromDate,
    toDate: result?.result?.toDate || listInput.toDate,
    status: result?.result?.status || listInput.status,
    statusMode: result?.result?.statusMode || listInput.statusMode,
    createdBy: resolvedCreatedBy || "",
    top: responseTop,
    skip: responseSkip,
  });

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
        orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
        dateText: listInput.dateText || query,
      },
    },
    data: rows,
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
      },
    },
  });

  sse.send("reply", {
    ok: true,
    sessionId: String(session._id),
    systemId: effectiveSystemId,
    sapUser: effectiveSapUser,
    reply,
    summary: result?.message || `Fetched ${rows.length} change request(s).`,
    data: rows,
    pagination: {
      top: responseTop,
      skip: responseSkip,
      nextSkip: responseNextSkip,
      orderBy: result?.result?.orderBy || listInput.orderBy || "CREATED_ON desc",
    },
    suggestions: buildCrSuggestions(query, listInput.businessScope, rows),
  });

  sse.send("done", { ok: true });
  return sse.end();
}
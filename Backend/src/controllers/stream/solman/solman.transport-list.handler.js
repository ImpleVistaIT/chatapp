import { getTransportNumbersFromCr } from "../../../services/systems/solman/transport.service.js";
import {
  cleanString,
  formatDisplayDate,
  persistAssistantAndTouchSession,
} from "./solman.shared.js";
import { step } from "../stream.shared.js";

function pickTransportListEntities(raw = {}, query = "") {
  const q = cleanString(query);

  const objectId = cleanString(
    raw.objectId ||
      raw.OBJECT_ID ||
      raw.OBJ_ID ||
      raw.changeRequestId ||
      raw.crId ||
      raw.crNumber ||
      (() => {
        const m = q.match(/\b(8\d{9}|9\d{9})\b/);
        return m ? m[1] : "";
      })()
  );

  const processType = cleanString(raw.processType || raw.PROCESS_TYPE || "");

  return {
    objectId,
    processType,
  };
}

function formatTimeValue(value) {
  const s = cleanString(value);

  if (!s) return "-";

  const pt = s.match(/^PT(\d{1,2})H(\d{1,2})M(\d{1,2})S$/i);
  if (pt) {
    const [, hh, mm, ss] = pt;
    return `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  }

  return s;
}

function formatDateTime(dateValue, timeValue) {
  const d = formatDisplayDate(dateValue);
  const t = formatTimeValue(timeValue);

  if (d === "-" && t === "-") return "-";
  if (d === "-") return t;
  if (t === "-") return d;
  return `${d} ${t}`;
}

function buildTransportTableRows(rows = []) {
  return rows.map((item, index) => ({
    no: index + 1,
    transport: cleanString(item?.Trkorr) || "-",
    description: cleanString(item?.Desc) || "-",
    owner: cleanString(item?.Owner) || "-",
    transportType:
      cleanString(item?.TrfuncDescription) || cleanString(item?.Trfunction) || "-",
    task: cleanString(item?.Tasks) || "-",
    taskOwner: cleanString(item?.TaskOwner) || "-",
    taskType:
      cleanString(item?.TaskFuncDescription) || cleanString(item?.TaskFunc) || "-",
    devCreated: formatDateTime(item?.DevCreatedDate, item?.DevCreatedTime),
    devReleased: formatDateTime(item?.DevReleasedDate, item?.DevReleasedTime),
    taskReleased: formatDateTime(item?.TaskExdate, item?.TaskExtime),
  }));
}

function formatTransportListReply(result = {}) {
  const changeRequestId = cleanString(result?.changeRequestId);
  const rows = Array.isArray(result?.rows) ? result.rows : [];

  if (rows.length === 0) {
    return `Transport details for CR ${changeRequestId || "-"}\n\nNo transports found for this change request.`;
  }

  return `Transport details for CR ${changeRequestId || "-"}\n\nFound ${rows.length} transport record(s).`;
}

export async function handleTransportList(context) {
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

  const input = pickTransportListEntities(classified?.entities || {}, query);
  const objectId = cleanString(input.objectId);
  const processType = cleanString(input.processType) || "YMHF";

  if (!objectId) {
    const message =
      "Please provide the change request number to view associated transports.";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user to provide the change request number for transport lookup.",
      extracted: {
        system: "solman",
        intent: "transport_list",
        pending: true,
        processType,
      },
      data: {
        missingFields: ["objectId"],
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport_list",
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
      missingFields: ["objectId"],
    });
    return sse.end();
  }

  sse.send("phase", {
    phase: "executing",
    message: "Fetching transports associated with the change request...",
  });

  const result = await step("getTransportNumbersFromCr", () =>
    getTransportNumbersFromCr({
      system,
      sapAuth,
      changeRequestId: objectId,
      processType,
    })
  );

  if (!result?.ok) {
    const message =
      result?.message || `Failed to fetch transports for CR ${objectId}.`;

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Transport lookup failed.",
      extracted: {
        system: "solman",
        intent: "transport_list",
        objectId,
        processType,
      },
      data: {
        raw: result?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport_list",
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

  const rows = Array.isArray(result?.result?.rows) ? result.result.rows : [];
  const tableRows = buildTransportTableRows(rows);
  const reply = formatTransportListReply(result.result);

  const responseData = {
    ...(result?.result || {}),
    viewType: "transport_list_table",
    columns: [
      "No",
      "Transport",
      "Description",
      "Owner",
      "Transport Type",
      "Task",
      "Task Owner",
      "Task Type",
      "Dev Created",
      "Dev Released",
      "Task Released",
    ],
    tableRows,
  };

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary: result?.message || `Fetched transports for CR ${objectId}.`,
    extracted: {
      system: "solman",
      intent: "transport_list",
      objectId,
      processType,
      transports: result?.result?.transports || [],
    },
    data: responseData,
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.transport_list",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
    },
  });

  sse.send("reply", {
    ok: true,
    sessionId: String(session._id),
    systemId: effectiveSystemId,
    sapUser: effectiveSapUser,
    reply,
    summary: result?.message || `Fetched transports for CR ${objectId}.`,
    data: responseData,
    suggestions: [
      `Check dependency transport for CR ${objectId}`,
      `Show status of CR ${objectId}`,
    ],
  });

  sse.send("done", { ok: true });
  return sse.end();
}
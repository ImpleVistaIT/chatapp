import { getSolmanChangeRequestDetailsById } from "../../../services/systems/solman/charm.service.js";
import {
  formatCrDetailsReply,
  getCrNumber,
  persistAssistantAndTouchSession,
  pickCrDetailsEntities,
  toCrDetailsArray,
} from "./solman.shared.js";
import { step } from "../stream.shared.js";

export async function handleCrDetails(context) {
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

  const detailsInput = pickCrDetailsEntities(classified?.entities || {}, query);
  const objectId = detailsInput.objectId;
  const processType = detailsInput.processType || "YMHF";

  if (!objectId) {
    const message = "Please provide the change request number.";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user to provide the change request number.",
      extracted: {
        system: "solman",
        intent: "get_change_request_details",
        pending: true,
        processType,
      },
      data: {
        missingFields: ["objectId"],
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.get_change_request_details",
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
    message: "Fetching change request details from Solution Manager...",
  });

  const result = await step("getSolmanChangeRequestDetailsById", () =>
    getSolmanChangeRequestDetailsById({
      system,
      sapAuth,
      objectId,
      processType,
    })
  );

  if (result?.ok === false) {
    const message = result?.message || "Failed to fetch change request details";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Fetching change request details failed.",
      extracted: {
        system: "solman",
        intent: "get_change_request_details",
        objectId,
        processType,
      },
      data: {
        raw: result?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.get_change_request_details",
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
  const item = rows[0] || null;
  const crNumber = getCrNumber(item || { OBJECT_ID: objectId });

  if (!item) {
    const message = `No details found for CR ${objectId}.`;

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: `No details found for CR ${objectId}.`,
      extracted: {
        system: "solman",
        intent: "get_change_request_details",
        objectId,
        processType,
      },
      data: [],
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.get_change_request_details",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "not_found",
      },
    });

    sse.send("error", {
      ok: false,
      status: "not_found",
      message,
      data: [],
    });
    return sse.end();
  }

  const reply = formatCrDetailsReply(item);

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary: `Fetched details for CR Number ${crNumber}.`,
    extracted: {
      system: "solman",
      intent: "get_change_request_details",
      objectId,
      processType,
    },
    data: rows,
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.get_change_request_details",
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
    summary: `Fetched details for CR Number ${crNumber}.`,
    data: rows,
    suggestions: [
      `Show status of CR ${crNumber}`,
      "Create another change request",
    ],
  });

  sse.send("done", { ok: true });
  return sse.end();
}
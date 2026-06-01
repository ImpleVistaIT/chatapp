import { createSolmanChangeRequest } from "../../../services/systems/solman/charm.service.js";
import {
  getMissingCreateCrFields,
  persistAssistantAndTouchSession,
  pickCreateCrEntities,
} from "./solman.shared.js";
import { step } from "../stream.shared.js";

export async function handleCreateCr(context) {
  const {
    sse,
    owner,
    session,
    system,
    sapAuth,
    effectiveSystemId,
    effectiveSapUser,
    classified,
  } = context;

  const collected = pickCreateCrEntities(classified?.entities || {});
  const missingFields = getMissingCreateCrFields(collected);

  if (missingFields.length > 0) {
    const message = "Please complete the required change request details.";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user to complete required change request details.",
      extracted: {
        system: "solman",
        intent: "create_change_request",
        pending: true,
        payload: collected,
        missingFields,
      },
      data: {
        action: {
          type: "open_form",
          formId: "solman_create_cr",
        },
        pendingAction: {
          collected,
          missingFields,
        },
        missingFields,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.create_change_request",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "needs_input",
      },
    });

    sse.send("error", {
      ok: false,
      status: "needs_input",
      message,
      action: {
        type: "open_form",
        formId: "solman_create_cr",
      },
      pendingAction: {
        collected,
        missingFields,
      },
      missingFields,
    });
    return sse.end();
  }

  sse.send("phase", {
    phase: "executing",
    message: "Creating change request in Solution Manager...",
  });

  const result = await step("createSolmanChangeRequest", () =>
    createSolmanChangeRequest({
      system,
      sapAuth,
      payload: collected,
    })
  );

  if (!result?.ok) {
    const message = result?.message || "Failed to create change request";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Change request creation failed.",
      extracted: {
        system: "solman",
        intent: "create_change_request",
        payload: collected,
      },
      data: {
        sap: {
          msgType: result?.result?.msgType,
          message: result?.message,
          changeRequestId: result?.result?.changeRequestId,
          status: result?.result?.status,
        },
        raw: result?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.create_change_request",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "execution_failed",
      },
    });

    sse.send("error", {
      ok: false,
      status: "execution_failed",
      message,
      sap: {
        msgType: result?.result?.msgType,
        message: result?.message,
        changeRequestId: result?.result?.changeRequestId,
        status: result?.result?.status,
      },
      raw: result?.result?.raw || null,
    });
    return sse.end();
  }

  const reply =
    `Change request ${result.result?.changeRequestId} created successfully.\n` +
    `Status: ${result.result?.status || "-"}\n` +
    `Message: ${result.message || "-"}`;

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary: result.message || "Change request created successfully.",
    extracted: {
      system: "solman",
      intent: "create_change_request",
      payload: collected,
    },
    data: {
      changeRequestId: result.result?.changeRequestId,
      status: result.result?.status,
      msgType: result.result?.msgType,
      raw: result.result?.raw || null,
    },
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.create_change_request",
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
    summary: result.message || "Change request created successfully.",
    data: {
      changeRequestId: result.result?.changeRequestId,
      status: result.result?.status,
      msgType: result.result?.msgType,
    },
    suggestions: [
      `Show status of CR ${result.result?.changeRequestId}`,
      "Create another change request",
    ],
  });

  sse.send("done", { ok: true });
  return sse.end();
}
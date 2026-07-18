import { step } from "../stream.shared.js";
import { cleanString, persistAssistantAndTouchSession } from "./solman.shared.js";
import { importTransportToProduction } from "../../../services/systems/solman/importTransportToProduction.service.js";

const INTENT = "import_transport_to_production";
const FORM_ID = "solman_import_transport_to_production";

function buildReply(result = {}) {
  const lines = ["Production Import Transport request submitted."];

  if (cleanString(result.transportNumber)) lines.push(`Transport: ${cleanString(result.transportNumber)}`);
  if (cleanString(result.message)) lines.push(`Message: ${cleanString(result.message)}`);

  return lines.join("\n");
}

export async function handleImportTransportToProduction(context) {
  const { sse, owner, query, session, system, sapAuth, effectiveSystemId, effectiveSapUser, classified } = context;

  const transportNumber = cleanString(
    classified?.entities?.transportNumber ||
      classified?.entities?.transportId ||
      classified?.entities?.transport ||
      query.match(/\b([A-Z]{2,6}\d{4,10})\b/i)?.[1]
  ).toUpperCase();

  if (!transportNumber) {
    const message = "Please provide the transport number to import to production.";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user for production import transport number.",
      extracted: {
        system: "solman",
        intent: INTENT,
        pending: true,
        payload: {},
      },
      data: {
        action: {
          type: "open_form",
          formId: FORM_ID,
        },
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport.importTransportToProduction",
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
      action: {
        type: "open_form",
        formId: FORM_ID,
      },
    });
    return sse.end();
  }

  sse.send("phase", {
    phase: "executing",
    message: "Importing transport to production...",
  });

  const result = await step("importTransportToProduction", () =>
    importTransportToProduction({
      system,
      sapAuth,
      payload: {
        transportNumber,
        sapUser: effectiveSapUser,
        systemId: effectiveSystemId,
      },
    })
  );

  if (!result?.ok) {
    const message = result?.message || "Failed to import transport to production.";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Production import transport failed.",
      extracted: {
        system: "solman",
        intent: INTENT,
        payload: { transportNumber },
      },
      data: {
        endpoint: result?.endpoint || null,
        requestBody: result?.requestBody || null,
        raw: result?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport.importTransportToProduction",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "execution_failed",
      },
    });

    sse.send("error", {
      ok: false,
      status: "execution_failed",
      message,
      endpoint: result?.endpoint || null,
      requestBody: result?.requestBody || null,
      raw: result?.result?.raw || null,
    });
    return sse.end();
  }

  const reply = buildReply({ transportNumber, message: result?.message });

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary: result?.message || "Production import transport completed.",
    extracted: {
      system: "solman",
      intent: INTENT,
      payload: { transportNumber },
    },
    data: {
      endpoint: result?.endpoint || null,
      requestBody: result?.requestBody || null,
      result: result?.result || null,
      viewType: "solman_import_transport_to_production_success",
    },
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.transport.importTransportToProduction",
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
    summary: result?.message || "Production import transport completed.",
    data: {
      endpoint: result?.endpoint || null,
      requestBody: result?.requestBody || null,
      result: result?.result || null,
      viewType: "solman_import_transport_to_production_success",
    },
  });

  sse.send("done", { ok: true });
  return sse.end();
}

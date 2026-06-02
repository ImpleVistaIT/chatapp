import { getDependentTransportsFromCr } from "../../../services/systems/solman/transport.service.js";
import {
  cleanString,
  persistAssistantAndTouchSession,
} from "./solman.shared.js";
import { step } from "../stream.shared.js";

function pickTransportDependencyEntities(raw = {}, query = "") {
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

function formatTransportDependencyReply(result = {}) {
  const changeRequestId = cleanString(result?.changeRequestId);
  const sourceTransports = Array.isArray(result?.sourceTransports)
    ? result.sourceTransports.filter(Boolean)
    : [];
  const dependencies = Array.isArray(result?.dependencies)
    ? result.dependencies.filter(
        (item) =>
          item &&
          (
            cleanString(item.transportEntered) ||
            cleanString(item.dependentTransport) ||
            cleanString(item.description) ||
            cleanString(item.owner) ||
            cleanString(item.exportDate) ||
            cleanString(item.exportTime) ||
            cleanString(item.importDate) ||
            cleanString(item.importTime)
          )
      )
    : [];
  const dependencyMessage = cleanString(result?.dependencyMessage);

  const lines = [];
  const crLabel = changeRequestId || "-";

  // lines.push(`Here are the dependent transport details for Change Request ${crLabel}.`);

  if (sourceTransports.length > 0) {
    lines.push("");
    lines.push(`Original transport${sourceTransports.length > 1 ? "s" : ""}:`);
    for (const tr of sourceTransports) {
      lines.push(`- ${tr}`);
    }
  }

  if (dependencyMessage) {
    lines.push("");
    lines.push(`SAP Message: ${dependencyMessage}`);
  }

  if (dependencies.length === 0) {
    lines.push("");
    lines.push(`No dependent transports were found for Change Request ${crLabel}.`);
    return lines.join("\n");
  }

  lines.push("");
  lines.push(
    `Found ${dependencies.length} dependent transport${dependencies.length > 1 ? "s" : ""}:`
  );

  dependencies.forEach((item, index) => {
    lines.push("");
    lines.push(`${index + 1}. Entered Transport: ${cleanString(item.transportEntered) || "-"}`);
    lines.push(`   Dependent Transport: ${cleanString(item.dependentTransport) || "-"}`);
    lines.push(`   Description: ${cleanString(item.description) || "-"}`);
    lines.push(`   Owner: ${cleanString(item.owner) || "-"}`);

    if (cleanString(item.exportDate) || cleanString(item.exportTime)) {
      lines.push(
        `   Exported On: ${`${cleanString(item.exportDate) || "-"} ${cleanString(item.exportTime) || ""}`.trim()}`
      );
    }

    if (cleanString(item.importDate) || cleanString(item.importTime)) {
      lines.push(
        `   Imported On: ${`${cleanString(item.importDate) || "-"} ${cleanString(item.importTime) || ""}`.trim()}`
      );
    }
  });

  return lines.join("\n");
}

export async function handleTransportDependency(context) {
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

  const input = pickTransportDependencyEntities(classified?.entities || {}, query);
  const objectId = cleanString(input.objectId);
  const processType = cleanString(input.processType) || "YMHF";

  if (!objectId) {
    const message =
      "Please provide the change request number to check dependent transports.";

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Asked user to provide the change request number for transport dependency check.",
      extracted: {
        system: "solman",
        intent: "transport_dependency_check",
        pending: true,
        processType,
      },
      data: {
        missingFields: ["objectId"],
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport_dependency_check",
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
    message: "Fetching transports from change request and checking dependencies...",
  });

  const result = await step("getDependentTransportsFromCr", () =>
    getDependentTransportsFromCr({
      system,
      sapAuth,
      changeRequestId: objectId,
      processType,
    })
  );

  if (!result?.ok) {
    const message =
      result?.message || `Failed to check dependent transports for CR ${objectId}.`;

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "Transport dependency check failed.",
      extracted: {
        system: "solman",
        intent: "transport_dependency_check",
        objectId,
        processType,
      },
      data: {
        raw: result?.result?.raw || null,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman.transport_dependency_check",
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

  const reply = formatTransportDependencyReply(result.result);

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: reply,
    summary:
      result?.message || `Checked dependent transports for CR ${objectId}.`,
    extracted: {
      system: "solman",
      intent: "transport_dependency_check",
      objectId,
      processType,
      transports: result?.result?.sourceTransports || [],
    },
    data: result?.result || {},
    responseMeta: {
      ok: true,
      kind: "stream",
      executor: "solman.transport_dependency_check",
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
    summary: result?.message || `Checked dependent transports for CR ${objectId}.`,
    data: result?.result || {},
    suggestions: [
      `Show status of CR ${objectId}`,
      `Check dependency transport for CR ${objectId}`,
    ],
  });

  sse.send("done", { ok: true });
  return sse.end();
}
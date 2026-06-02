import { ChatSession } from "../../../models/ChatSession.model.js";
import { SapSystem } from "../../../models/SapSystem.model.js";
import {
  getOrCreateSession,
  getSapAuthOrThrow,
  normalizeSapUser,
  normalizeSystemId,
  saveUserMessage,
  step,
} from "../stream.shared.js";
import {
  inferCrListIntent,
  persistAssistantAndTouchSession,
  cleanString,
} from "./solman.shared.js";
import { handleCreateCr } from "./solman.create-cr.handler.js";
import { handleCrDetails } from "./solman.cr-details.handler.js";
import { handleCrList } from "./solman.cr-list.handler.js";
import { handleCrCreatedBy } from "./solman.cr-created-by.handler.js";
import { handleDependencyCheck } from "./solman.dependency-check.handler.js";
import { handleTransportDependency } from "./solman.transport-dependency.handler.js";
import { handleTransportList } from "./solman.transport-list.handler.js";

function normalizeIntentQuery(query = "") {
  return cleanString(query)
    .toLowerCase()
    .replace(/\btr['’]s\b/g, "tr")
    .replace(/\btrs\b/g, "tr")
    .replace(/\btransport requests\b/g, "transport")
    .replace(/\btransport request\b/g, "transport");
}

function hasCrReference(query = "") {
  return /\bcr\b|\bchange request\b/.test(query);
}

function hasTransportReference(query = "") {
  return /\btransport\b|\btransports\b|\btr\b/.test(query);
}

function hasDependencyReference(query = "") {
  return /\bdependent\b|\bdependency\b|\bdependencies\b/.test(query);
}

function isTransportDependencyIntent(classified, query = "") {
  const intent = cleanString(classified?.intent).toLowerCase();
  const q = normalizeIntentQuery(query);

  if (
    intent === "transport_dependency_check" ||
    intent === "check_dependency_transport" ||
    intent === "dependency_transport_check" ||
    intent === "get_dependent_transports_from_cr"
  ) {
    return true;
  }

  return hasCrReference(q) && hasTransportReference(q) && hasDependencyReference(q);
}

function isTransportListIntent(classified, query = "") {
  const intent = cleanString(classified?.intent).toLowerCase();
  const q = normalizeIntentQuery(query);

  if (
    intent === "transport_list" ||
    intent === "get_transports_from_cr" ||
    intent === "show_transports_for_cr" ||
    intent === "get_transport_details_from_cr"
  ) {
    return true;
  }

  return hasCrReference(q) && hasTransportReference(q) && !hasDependencyReference(q);
}

function isCrCreatedByIntent(classified, query = "") {
  const intent = cleanString(classified?.intent).toLowerCase();
  const q = normalizeIntentQuery(query);

  if (
    intent === "list_change_requests_by_created_by" ||
    intent === "get_change_requests_by_created_by" ||
    intent === "show_cr_created_by" ||
    intent === "show_cr_created_by_user" ||
    intent === "show_my_cr" ||
    intent === "show_my_crs" ||
    intent === "my_change_requests"
  ) {
    return true;
  }

  return (
    hasCrReference(q) &&
    (/\bcreated by me\b/.test(q) ||
      /\bcreated by myself\b/.test(q) ||
      /\bshow my cr\b/.test(q) ||
      /\bshow my crs\b/.test(q) ||
      /\bmy cr\b/.test(q) ||
      /\bmy crs\b/.test(q) ||
      /\bmy change request\b/.test(q) ||
      /\bmy change requests\b/.test(q) ||
      /\bcreated by\s+[a-z0-9._-]+\b/i.test(q))
  );
}

export async function handleSolmanChatStream({
  sse,
  owner,
  query,
  sessionId,
  systemId,
  sapUser,
  classified,
}) {
  const effectiveSystemId = normalizeSystemId(systemId);

  if (!effectiveSystemId) {
    sse.send("error", { message: "systemId is required" });
    return sse.end();
  }

  const sapAuth = await step("getSapAuthOrThrow", () =>
    getSapAuthOrThrow({
      owner,
      systemId: effectiveSystemId,
      sapUser,
    })
  );

  const effectiveSapUser = normalizeSapUser(sapAuth?.sapUser);

  const session = await step("getOrCreateSession", () =>
    getOrCreateSession({
      owner,
      sessionId,
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
    })
  );

  await step("save user message", () =>
    saveUserMessage({
      owner,
      sessionId: session._id,
      text: query,
    })
  );

  await step("set session title (first message only)", async () => {
    if (!session.title) {
      await ChatSession.updateOne(
        { _id: session._id },
        { $set: { title: String(query).slice(0, 80), updatedAt: new Date() } }
      );
    }
  });

  const system = await step("load SapSystem", () =>
    SapSystem.findOne({
      owner: { $in: [owner, "local"] },
      systemId: effectiveSystemId,
    }).lean()
  );

  if (!system) {
    const message = `SAP system profile not found for systemId=${effectiveSystemId}`;

    await persistAssistantAndTouchSession({
      owner,
      sessionId: session._id,
      text: message,
      summary: "SAP system profile not found.",
      extracted: {
        system: "solman",
      },
      data: {
        systemId: effectiveSystemId,
      },
      responseMeta: {
        ok: false,
        kind: "stream",
        executor: "solman",
        systemId: effectiveSystemId,
        sapUser: effectiveSapUser,
        status: "missing_system_profile",
      },
    });

    sse.send("error", {
      message,
    });
    return sse.end();
  }

  const context = {
    sse,
    owner,
    query,
    session,
    system,
    sapAuth,
    effectiveSystemId,
    effectiveSapUser,
    classified,
  };

  if (classified?.intent === "create_change_request") {
    return handleCreateCr(context);
  }

  if (isTransportDependencyIntent(classified, query)) {
    return handleTransportDependency(context);
  }

  if (isTransportListIntent(classified, query)) {
    return handleTransportList(context);
  }

  if (isCrCreatedByIntent(classified, query)) {
    return handleCrCreatedBy(context);
  }

  if (classified?.intent === "get_change_request_details") {
    return handleCrDetails(context);
  }

  if (
    classified?.intent === "dependency_check" ||
    classified?.intent === "check_dependency_transport" ||
    classified?.intent === "dependency_transport_check"
  ) {
    return handleDependencyCheck(context);
  }

  if (inferCrListIntent(classified, query)) {
    return handleCrList(context);
  }

  const unsupportedMessage =
    "This Solution Manager request is not supported yet in chat stream.";

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: unsupportedMessage,
    summary: "Unsupported Solution Manager request.",
    extracted: {
      system: "solman",
    },
    data: null,
    responseMeta: {
      ok: false,
      kind: "stream",
      executor: "solman",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      status: "unsupported",
    },
  });

  sse.send("error", {
    message: unsupportedMessage,
    status: "unsupported",
  });
  return sse.end();
}
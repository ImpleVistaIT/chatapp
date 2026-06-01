import { persistAssistantAndTouchSession } from "./solman.shared.js";

export async function handleDependencyCheck(context) {
  const {
    sse,
    owner,
    session,
    effectiveSystemId,
    effectiveSapUser,
  } = context;

  const message = "Dependency check is not implemented yet.";

  await persistAssistantAndTouchSession({
    owner,
    sessionId: session._id,
    text: message,
    summary: "Dependency check is not implemented yet.",
    extracted: {
      system: "solman",
      intent: "dependency_check",
    },
    data: null,
    responseMeta: {
      ok: false,
      kind: "stream",
      executor: "solman.dependency_check",
      systemId: effectiveSystemId,
      sapUser: effectiveSapUser,
      status: "not_implemented",
    },
  });

  sse.send("error", {
    ok: false,
    status: "not_implemented",
    message,
  });
  return sse.end();
}
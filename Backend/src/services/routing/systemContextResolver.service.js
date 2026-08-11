function normalizeSystemId(v) {
  return String(v || "").trim().toUpperCase();
}

function normalizeHost(v) {
  return String(v || "").trim().toLowerCase();
}

function normalizePort(v) {
  return String(v || "").trim();
}

function toSystemList(availableSystems) {
  return Array.isArray(availableSystems) ? availableSystems : [];
}

function extractIds(availableSystems) {
  return toSystemList(availableSystems)
    .map((s) => normalizeSystemId(s?.systemId || s?.id || s?.code))
    .filter(Boolean);
}

function isConnectedSystem(system) {
  if (!system) return false;

  if (system.connected === false) return false;
  if (system.isConnected === false) return false;
  if (String(system.status || "").toLowerCase() === "disconnected") return false;

  return true;
}

function getEndpoint(system) {
  return {
    host: normalizeHost(system?.host),
    port: normalizePort(system?.port),
  };
}

function findSystemByEndpoint(availableSystems, endpoint) {
  const wantedHost = normalizeHost(endpoint?.host);
  const wantedPort = normalizePort(endpoint?.port);

  if (!wantedHost || !wantedPort) return null;

  const matches = toSystemList(availableSystems).filter((s) => {
    const ep = getEndpoint(s);
    return ep.host === wantedHost && ep.port === wantedPort;
  });

  if (matches.length === 0) return null;

  // Prefer a connected record when multiple credentials share the same endpoint.
  const connectedMatch = matches.find(isConnectedSystem);
  if (connectedMatch) return connectedMatch;

  return matches[0] || null;
}

function findPreferredSolmanSystem(availableSystems) {
  const systems = toSystemList(availableSystems);
  const hsd = systems.find((system) => normalizeSystemId(system?.systemId || system?.id || system?.code) === "HSD");
  if (hsd) return hsd;

  return systems.find((system) => {
    const label = normalizeSystemId(system?.name || "");
    return label.includes("SOLMAN");
  }) || null;
}

export async function resolveTargetSystem({
  query,
  classified,
  requestedSystemId = "",
  availableSystems = [],
}) {
  const systems = toSystemList(availableSystems);
  const ids = extractIds(systems);
  const requestedId = normalizeSystemId(requestedSystemId);
  const systemLabel = normalizeSystemId(classified?.system || classified?.routing?.system || "");
  const intentLabel = normalizeSystemId(classified?.intent || classified?.routing?.intent || "");
  const isSolmanRequest =
    systemLabel === "SOLMAN" ||
    intentLabel.includes("CHANGE_REQUEST") ||
    intentLabel.includes("TRANSPORT") ||
    /\b(change request|change requests|cr|charm|transport|solman)\b/i.test(String(query || ""));

  console.log("[SYSTEM_RESOLVER] incoming request:", {
    requestSystemId: requestedId || null,
    feature: systemLabel || null,
    serviceName: classified?.serviceName || classified?.routing?.serviceName || null,
    query: String(query || "").slice(0, 250),
  });
  console.log("[SYSTEM_RESOLVER] available systems:", ids);
  console.log("[SYSTEM_RESOLVER] classification context:", {
    system: systemLabel || null,
    intent: intentLabel || null,
    isSolmanRequest,
  });

  if (isSolmanRequest) {
    const preferredSolman = findPreferredSolmanSystem(systems);
    if (preferredSolman) {
      const targetSystemId = normalizeSystemId(preferredSolman?.systemId || preferredSolman?.id || preferredSolman?.code || "HSD");
      console.log("[SYSTEM_RESOLVER] solman preferred match:", {
        selectedSystemId: targetSystemId || null,
        host: getEndpoint(preferredSolman).host || null,
        port: getEndpoint(preferredSolman).port || null,
        connected: isConnectedSystem(preferredSolman),
      });
      return {
        status: isConnectedSystem(preferredSolman) ? "resolved" : "disconnected",
        targetSystemId,
        targetEndpoint: getEndpoint(preferredSolman),
        candidates: ids,
        reason: isConnectedSystem(preferredSolman) ? "solman_preferred_connected" : "solman_preferred_disconnected",
      };
    }

    console.log("[SYSTEM_RESOLVER] solman preferred match missing; no default system will be applied");
    return {
      status: "unknown",
      targetSystemId: null,
      targetEndpoint: null,
      candidates: ids,
      reason: "solman_preferred_missing",
    };
  }

  if (requestedId) {
    const requestedMatches = systems.filter(
      (s) => normalizeSystemId(s?.systemId || s?.id || s?.code) === requestedId
    );

    console.log("[SYSTEM_RESOLVER] requested system lookup:", {
      query: { systemId: requestedId },
      matchCount: requestedMatches.length,
      matches: requestedMatches.map((system) => ({
        systemId: normalizeSystemId(system?.systemId || system?.id || system?.code) || null,
        name: String(system?.name || "").trim() || null,
        host: String(system?.host || "").trim() || null,
        port: String(system?.port || "").trim() || null,
        connected: isConnectedSystem(system),
      })),
    });

    if (requestedMatches.length > 0) {
      const connectedRequested = requestedMatches.find(isConnectedSystem);

      if (connectedRequested) {
        return {
          status: "resolved",
          targetSystemId: requestedId,
          targetEndpoint: getEndpoint(connectedRequested),
          candidates: ids,
          reason: "explicit_requested_system_connected",
        };
      }

      return {
        status: "disconnected",
        targetSystemId: requestedId,
        targetEndpoint: getEndpoint(requestedMatches[0]),
        candidates: ids,
        reason: "explicit_requested_system_disconnected",
      };
    }
  }

  if (requestedId) {
    const requestedMatches = systems.filter(
      (s) => normalizeSystemId(s?.systemId || s?.id || s?.code) === requestedId
    );

    console.log("[SYSTEM_RESOLVER] non-solman requested system lookup:", {
      query: { systemId: requestedId },
      matchCount: requestedMatches.length,
      matches: requestedMatches.map((system) => ({
        systemId: normalizeSystemId(system?.systemId || system?.id || system?.code) || null,
        name: String(system?.name || "").trim() || null,
        host: String(system?.host || "").trim() || null,
        port: String(system?.port || "").trim() || null,
        connected: isConnectedSystem(system),
      })),
    });

    if (requestedMatches.length > 0) {
      const connectedRequested = requestedMatches.find(isConnectedSystem);
      if (connectedRequested) {
        return {
          status: "resolved",
          targetSystemId: requestedId,
          targetEndpoint: getEndpoint(connectedRequested),
          candidates: ids,
          reason: "explicit_requested_system_connected",
        };
      }

      return {
        status: "disconnected",
        targetSystemId: requestedId,
        targetEndpoint: getEndpoint(requestedMatches[0]),
        candidates: ids,
        reason: "explicit_requested_system_disconnected",
      };
    }
  }

  return {
    status: "unknown",
    targetSystemId: null,
    targetEndpoint: null,
    candidates: ids,
    reason: "no_connected_match",
  };
}
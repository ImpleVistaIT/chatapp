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

function inferPreferredEndpoint({ query, classified }) {
  const system = String(classified?.routing?.system || classified?.system || "").toLowerCase();
  const module = String(classified?.routing?.module || classified?.module || "").toLowerCase();
  const intent = String(classified?.routing?.intent || classified?.intent || "").toLowerCase();
  const q = String(query || "").toLowerCase();

  // S/4 endpoint
  const s4Endpoint = {
    host: "192.168.1.5",
    port: "44300",
  };

  // SolMan endpoint
  const solmanEndpoint = {
    host: "192.168.1.219",
    port: "50101",
  };

  if (system === "s4hana" || system === "s4") return s4Endpoint;
  if (system === "solman") return solmanEndpoint;

  if (module === "mm" || module === "sd") return s4Endpoint;
  if (module === "charm" || module === "transport") return solmanEndpoint;

  if (intent.includes("purchase_order") || intent.includes("sales_order")) return s4Endpoint;
  if (intent.includes("change_request") || intent.includes("transport")) return solmanEndpoint;

  if (/\b(po|purchase order|purchase orders|sales order|sales orders|invoice|delivery)\b/i.test(q)) {
    return s4Endpoint;
  }

  if (/\b(change request|charm|transport|solman|task list|cr)\b/i.test(q)) {
    return solmanEndpoint;
  }

  return null;
}

function isSolmanLikeQuery({ query, classified }) {
  const system = String(classified?.routing?.system || classified?.system || "").toLowerCase();
  const module = String(classified?.routing?.module || classified?.module || "").toLowerCase();
  const intent = String(classified?.routing?.intent || classified?.intent || "").toLowerCase();
  const q = String(query || "").toLowerCase();

  if (system === "solman") return true;
  if (module === "charm" || module === "transport") return true;
  if (intent.includes("change_request") || intent.includes("transport")) return true;

  return /\b(change request|change requests|cr|charm|transport|task list)\b/i.test(q);
}

function findPreferredSolmanSystem(connectedSystems) {
  const list = Array.isArray(connectedSystems) ? connectedSystems : [];

  // First preference: known SolMan SID in your environment
  const hsd = list.find(
    (s) => normalizeSystemId(s?.systemId || s?.id || s?.code) === "HSD"
  );
  if (hsd) return hsd;

  // Fallback: known SolMan endpoint
  const solmanEndpoint = { host: "192.168.1.219", port: "50101" };
  const endpointMatch = findSystemByEndpoint(list, solmanEndpoint);
  if (endpointMatch) return endpointMatch;

  return null;
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

  const preferredEndpoint = inferPreferredEndpoint({ query, classified });
  const solmanLike = isSolmanLikeQuery({ query, classified });

  if (requestedId) {
    const requestedMatches = systems.filter(
      (s) => normalizeSystemId(s?.systemId || s?.id || s?.code) === requestedId
    );

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

  if (systems.length === 0) {
    if (!preferredEndpoint) {
      return {
        status: "unknown",
        targetSystemId: null,
        targetEndpoint: null,
        candidates: [],
        reason: "no_available_systems",
      };
    }

    return {
      status: "resolved",
      targetSystemId: null,
      targetEndpoint: preferredEndpoint,
      candidates: [],
      reason: "resolved_by_endpoint_without_available_systems",
    };
  }

  if (preferredEndpoint) {
    const matched = findSystemByEndpoint(systems, preferredEndpoint);

    if (!matched) {
      const connectedSystems = systems.filter(isConnectedSystem);

      if (solmanLike) {
        const solmanFallback = findPreferredSolmanSystem(connectedSystems);
        if (solmanFallback) {
          return {
            status: "resolved",
            targetSystemId: normalizeSystemId(
              solmanFallback.systemId || solmanFallback.id || solmanFallback.code
            ),
            targetEndpoint: getEndpoint(solmanFallback),
            candidates: ids,
            reason: "solman_default_hsd_fallback",
          };
        }
      }

      return {
        status: "unknown",
        targetSystemId: null,
        targetEndpoint: preferredEndpoint,
        candidates: ids,
        reason: "preferred_endpoint_not_in_available_systems",
      };
    }

    if (!isConnectedSystem(matched)) {
      return {
        status: "disconnected",
        targetSystemId: normalizeSystemId(matched?.systemId || matched?.id || matched?.code),
        targetEndpoint: preferredEndpoint,
        candidates: ids,
        reason: "preferred_endpoint_disconnected",
      };
    }

    return {
      status: "resolved",
      targetSystemId: normalizeSystemId(
        matched.systemId || matched.id || matched.code
      ),
      targetEndpoint: preferredEndpoint,
      candidates: ids,
      reason: "resolved_by_endpoint",
    };
  }

  const connectedSystems = systems.filter(isConnectedSystem);

  if (connectedSystems.length === 1) {
    return {
      status: "resolved",
      targetSystemId: normalizeSystemId(
        connectedSystems[0].systemId || connectedSystems[0].id || connectedSystems[0].code
      ),
      targetEndpoint: getEndpoint(connectedSystems[0]),
      candidates: ids,
      reason: "single_connected_system",
    };
  }

  if (connectedSystems.length > 1) {
    if (solmanLike) {
      const solmanFallback = findPreferredSolmanSystem(connectedSystems);
      if (solmanFallback) {
        return {
          status: "resolved",
          targetSystemId: normalizeSystemId(
            solmanFallback.systemId || solmanFallback.id || solmanFallback.code
          ),
          targetEndpoint: getEndpoint(solmanFallback),
          candidates: connectedSystems.map((s) =>
            normalizeSystemId(s.systemId || s.id || s.code)
          ),
          reason: "solman_default_hsd_fallback",
        };
      }
    }

    return {
      status: "ambiguous",
      targetSystemId: null,
      targetEndpoint: null,
      candidates: connectedSystems.map((s) =>
        normalizeSystemId(s.systemId || s.id || s.code)
      ),
      reason: "multiple_connected_systems",
    };
  }

  return {
    status: "unknown",
    targetSystemId: null,
    targetEndpoint: null,
    candidates: ids,
    reason: "no_connected_match",
  };
}
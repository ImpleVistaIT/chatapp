import { API_BASE } from "./client";
import { authFetch } from "./authFetch";

async function parseJsonSafe(res) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function extractApiError(data, fallback) {
  return data?.message || data?.error?.message || data?.error || fallback;
}

async function readResponseBody(res) {
  const contentType = String(res.headers.get("content-type") || "").toLowerCase();

  if (contentType.includes("application/json") || contentType.includes("+json")) {
    const json = await res.clone().json().catch(() => null);
    if (json != null) return json;
  }

  const text = await res.clone().text().catch(() => "");
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    return {
      message: text,
      rawText: text,
    };
  }
}

export async function getSolmanChangeRequestDetails({
  systemId,
  sapUser,
  objectId,
  processType = "",
  businessScope = "",
}) {
  const res = await authFetch(
    `${API_BASE}/chat/actions/solman/get-change-request-details`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemId,
        sapUser,
        objectId,
        processType,
        businessScope,
      }),
    }
  );

  const data = await parseJsonSafe(res);

  if (
    !res.ok ||
    data?.ok === false ||
    data?.status === "execution_failed" ||
    data?.status === "validation_failed"
  ) {
    throw new Error(
      extractApiError(data, "Failed to fetch change request details.")
    );
  }

  return data;
}

export async function listSolmanChangeRequests({
  systemId,
  sapUser,
  processType = "",
  businessScope = "",
  fromDate,
  toDate,
  triggerAll = "X",
  status = "",
  statusMode = "",
  excludeStatuses = [],
  dateText = "",
  createdBy = "",
  createdByMode = "",
  top = null,
}) {
  const res = await authFetch(
    `${API_BASE}/chat/actions/solman/list-change-requests`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemId,
        sapUser,
        processType,
        businessScope,
        fromDate,
        toDate,
        triggerAll,
        status,
        statusMode,
        excludeStatuses,
        dateText,
        createdBy,
        createdByMode,
        top,
      }),
    }
  );

  const data = await parseJsonSafe(res);

  if (
    !res.ok ||
    data?.ok === false ||
    data?.status === "execution_failed" ||
    data?.status === "validation_failed"
  ) {
    throw new Error(extractApiError(data, "Failed to list change requests."));
  }

  return data;
}

export async function listSolmanChangeRequestsForExport({
  systemId,
  sapUser,
  processType = "",
  businessScope = "",
  fromDate,
  toDate,
  triggerAll = "X",
  status = "",
  statusMode = "",
  excludeStatuses = [],
  dateText = "",
  createdBy = "",
  createdByMode = "",
  top = null,
}) {
  const res = await authFetch(
    `${API_BASE}/chat/actions/solman/list-change-requests`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemId,
        sapUser,
        processType,
        businessScope,
        fromDate,
        toDate,
        triggerAll,
        status,
        statusMode,
        excludeStatuses,
        dateText,
        createdBy,
        createdByMode,
        top,
      }),
    }
  );

  const payload = await readResponseBody(res);

  return {
    ok: res.ok,
    status: res.status,
    payload,
  };
}

export async function listSolmanTransports({
  systemId,
  sapUser,
  objectId,
  processType = "",
  businessScope = "",
}) {
  const res = await authFetch(
    `${API_BASE}/chat/actions/solman/list-transports`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemId,
        sapUser,
        objectId,
        processType,
        businessScope,
      }),
    }
  );

  const data = await parseJsonSafe(res);

  if (
    !res.ok ||
    data?.ok === false ||
    data?.status === "execution_failed" ||
    data?.status === "validation_failed"
  ) {
    throw new Error(extractApiError(data, "Failed to fetch transport details."));
  }

  return data;
}

export async function releaseSolmanTransport({
  systemId,
  sapUser,
  transportNumber,
  quality = false,
}) {
  const res = await authFetch(`${API_BASE}/api/solman/release-transport`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemId,
      sapUser,
      transportNumber,
      quality: Boolean(quality),
    }),
  });

  const data = await parseJsonSafe(res);

  if (!res.ok || data?.ok === false || data?.success === false) {
    throw new Error(extractApiError(data, "Transport release failed."));
  }

  return data;
}
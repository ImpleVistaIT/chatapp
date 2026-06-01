import { authFetch } from "./authFetch";

const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

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

export async function getSolmanChangeRequestDetails({
  systemId,
  sapUser,
  objectId,
  processType = "",
  businessScope = "",
}) {
  const res = await authFetch(
    `${apiBase}/chat/actions/solman/get-change-request-details`,
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
  dateText = "",
  top = null,
}) {
  const res = await authFetch(
    `${apiBase}/chat/actions/solman/list-change-requests`,
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
        dateText,
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
import { useEffect, useState } from "react";
import { authFetch } from "../api/authFetch";
import { API_BASE } from "../api/client";

function clean(v) {
  return String(v || "").trim();
}

function normalizeDevelopers(values = []) {
  const seen = new Set();
  const developers = [];

  for (const value of Array.isArray(values) ? values : []) {
    const developer = clean(value).toUpperCase();
    if (!developer || seen.has(developer)) continue;
    seen.add(developer);
    developers.push(developer);
  }

  return developers;
}

export default function SolmanCreateTransportTaskForm({
  systemId = "",
  sapUser = "",
  sessionId = "",
  initialValues = {},
  pendingAction = null,
  onSuccess,
  onCancel,
}) {
  const [transportNo, setTransportNo] = useState("");
  const [changeRequest, setChangeRequest] = useState("");
  const [developers, setDevelopers] = useState([""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const values = initialValues && typeof initialValues === "object" ? initialValues : {};

    setTransportNo(clean(values.transportNo));
    setChangeRequest(clean(values.changeRequest));

    const normalized = normalizeDevelopers(values.developers);
    setDevelopers(normalized.length > 0 ? normalized : [""]);
  }, [initialValues]);

  const missingFields = Array.isArray(pendingAction?.missingFields) ? pendingAction.missingFields : [];

  function isMissing(field) {
    return missingFields.includes(field);
  }

  function fieldClass(field) {
    if (isMissing(field)) {
      return "w-full rounded-lg border border-amber-400 bg-amber-50 px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20";
    }

    return "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20";
  }

  async function handleSubmit() {
    setError("");

    const cleanTransportNo = clean(transportNo);
    const cleanChangeRequest = clean(changeRequest);
    const cleanDevelopers = normalizeDevelopers(developers).filter(Boolean);

    if (!clean(systemId)) {
      setError("No active SAP system selected.");
      return;
    }

    if (!clean(sapUser)) {
      setError("No active SAP user found.");
      return;
    }

    if (!cleanTransportNo || !cleanChangeRequest || cleanDevelopers.length === 0) {
      setError("Please fill all required fields.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await authFetch(`${API_BASE}/chat/actions/solman/create-transport-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId: clean(systemId),
          sapUser: clean(sapUser),
          sessionId: clean(sessionId),
          payload: {
            IM_TRANSPORT_NO: cleanTransportNo,
            IM_SOLMAN_CHANGE_REQ: cleanChangeRequest,
            DEVELOPERS: JSON.stringify(cleanDevelopers.map((developer) => ({ developer }))),
          },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false || data?.status === "execution_failed" || data?.status === "validation_failed") {
        throw new Error(data?.message || data?.error || "Failed to create transport tasks.");
      }

      onSuccess?.(data?.result || data);
      onCancel?.();
    } catch (e) {
      setError(e?.message || "Failed to create transport tasks.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Create Transport Tasks</h2>
        <p className="mt-1 text-xs text-zinc-500">
          Fill the transport request, change request, and developers to create tasks.
        </p>
      </div>

      <div className="space-y-4 p-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}

        {missingFields.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Missing fields: {missingFields.join(", ")}
          </div>
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Transport Number *</label>
          <input
            type="text"
            value={transportNo}
            onChange={(e) => setTransportNo(e.target.value)}
            placeholder="Enter transport number"
            className={fieldClass("transportNo")}
          />
        </div>

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Change Request Number *</label>
          <input
            type="text"
            value={changeRequest}
            onChange={(e) => setChangeRequest(e.target.value)}
            placeholder="Enter change request number"
            className={fieldClass("changeRequest")}
          />
        </div>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="block text-xs font-medium text-zinc-700">Developers *</label>
            <button
              type="button"
              className="text-xs font-medium text-green-700 hover:text-green-800"
              onClick={() => setDevelopers((prev) => [...prev, ""])}
            >
              + Add Developer
            </button>
          </div>

          <div className="space-y-2">
            {developers.map((developer, index) => (
              <input
                key={`${index}-${developer}`}
                type="text"
                value={developer}
                onChange={(e) => {
                  const next = [...developers];
                  next[index] = e.target.value;
                  setDevelopers(next);
                }}
                placeholder="Enter SAP user / developer ID"
                className={fieldClass("developers")}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isLoading}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800"
          >
            {isLoading ? "Creating..." : "Create Tasks"}
          </button>
        </div>
      </div>
    </div>
  );
}

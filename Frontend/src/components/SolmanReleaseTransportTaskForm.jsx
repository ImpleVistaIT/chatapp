import { useEffect, useState } from "react";
import { authFetch } from "../api/authFetch";
import { API_BASE } from "../api/client";

function clean(v) {
  return String(v || "").trim();
}

export default function SolmanReleaseTransportTaskForm({
  systemId = "",
  sapUser = "",
  sessionId = "",
  initialValues = {},
  pendingAction = null,
  onSuccess,
  onCancel,
}) {
  const [taskId, setTaskId] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const values = initialValues && typeof initialValues === "object" ? initialValues : {};
    setTaskId(clean(values.taskId || values.TaskId || values.IvTaskId));
  }, [initialValues]);

  const missingFields = Array.isArray(pendingAction?.missingFields) ? pendingAction.missingFields : [];
  const isMissing = missingFields.includes("taskId");

  async function handleSubmit() {
    setError("");

    const cleanTaskId = clean(taskId).toUpperCase();
    if (!clean(systemId)) return setError("No active SAP system selected.");
    if (!clean(sapUser)) return setError("No active SAP user found.");
    if (!cleanTaskId) return setError("Task number is required.");

    setIsLoading(true);
    try {
      const res = await authFetch(`${API_BASE}/chat/actions/solman/release-transport-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId: clean(systemId),
          sapUser: clean(sapUser),
          sessionId: clean(sessionId),
          payload: { IvTaskId: cleanTaskId },
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || data?.ok === false || data?.status === "execution_failed" || data?.status === "validation_failed") {
        throw new Error(data?.message || data?.error || "Failed to release task.");
      }

      onSuccess?.(data?.result || data);
      onCancel?.();
    } catch (e) {
      setError(e?.message || "Failed to release task.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Release Transport Task</h2>
        <p className="mt-1 text-xs text-zinc-500">Enter a task number and release it in SAP.</p>
      </div>

      <div className="space-y-4 p-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
        {missingFields.length > 0 && <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">Missing fields: {missingFields.join(", ")}</div>}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Task Number *</label>
          <input
            type="text"
            value={taskId}
            onChange={(e) => setTaskId(e.target.value)}
            placeholder="Enter task number"
            className={`w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 ${isMissing ? "border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500/20" : "border-gray-300 focus:border-green-600 focus:ring-green-600/20"}`}
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={isLoading} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">{isLoading ? "Releasing..." : "Release"}</button>
        </div>
      </div>
    </div>
  );
}
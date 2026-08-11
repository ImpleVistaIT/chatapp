import { useEffect, useState } from "react";
import { releaseSolmanTransport } from "../api/solmanApi";

function clean(value) {
  return String(value || "").trim();
}

export default function ReleaseTransportForm({
  systemId = "",
  sapUser = "",
  sessionId = "",
  initialValues = {},
  pendingAction = null,
  onSuccess,
  onCancel,
}) {
  const [transportNumber, setTransportNumber] = useState("");
  const [releaseToQuality, setReleaseToQuality] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const values = initialValues && typeof initialValues === "object" ? initialValues : {};
    setTransportNumber(clean(values.transportNumber || values.IvObjectId || values.transportNo));
    setReleaseToQuality(Boolean(values.quality ?? values.IvQuality ?? false));
  }, [initialValues]);

  const missingFields = Array.isArray(pendingAction?.missingFields) ? pendingAction.missingFields : [];

  function validate() {
    const trimmed = clean(transportNumber).toUpperCase();
    if (!trimmed) return "Transport Request Number is required.";
    if (trimmed.length > 10) return "Transport Request Number must be at most 10 characters.";
    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmed = clean(transportNumber).toUpperCase();
    const validationError = validate();
    if (validationError) {
      setError(validationError);
      return;
    }

    if (!clean(systemId)) {
      setError("No active SAP system selected.");
      return;
    }

    if (!clean(sapUser)) {
      setError("No active SAP user found.");
      return;
    }

    setIsLoading(true);
    try {
      const data = await releaseSolmanTransport({
        systemId: clean(systemId),
        sapUser: clean(sapUser),
        transportNumber: trimmed,
        quality: releaseToQuality,
      });

      onSuccess?.({
        ...(data?.data || data || {}),
        message: data?.message || `Transport ${trimmed} released successfully.`,
        transportNumber: trimmed,
        quality: releaseToQuality,
      });
      onCancel?.();
    } catch (err) {
      setError(err?.message || "Transport release failed.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Release Transport Request</h2>
        <p className="mt-1 text-xs text-zinc-500">Enter the transport request number and choose whether to release it to Quality.</p>
      </div>

      <div className="space-y-4 p-4">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        {missingFields.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Missing fields: {missingFields.join(", ")}
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Transport Request Number *</label>
          <input
            type="text"
            value={transportNumber}
            onChange={(e) => setTransportNumber(e.target.value)}
            placeholder="Enter Transport Request Number"
            maxLength={10}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
          />
        </div>

        <label className="flex items-center gap-3 rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 text-sm text-zinc-800">
          <input
            type="checkbox"
            checked={releaseToQuality}
            onChange={(e) => setReleaseToQuality(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-green-700 focus:ring-green-600"
          />
          <span>Release to Quality System</span>
        </label>

        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" /> : null}
            {isLoading ? "Releasing..." : "Release Transport"}
          </button>
        </div>
      </div>
    </form>
  );
}

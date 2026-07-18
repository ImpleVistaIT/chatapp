import { useEffect, useState } from "react";

function clean(value) {
  return String(value || "").trim();
}

export default function SolmanImportTransportToProductionForm({
  systemId = "",
  sapUser = "",
  sessionId = "",
  initialValues = {},
  pendingAction = null,
  onSubmit,
  onCancel,
}) {
  const [transportNumber, setTransportNumber] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const values = initialValues && typeof initialValues === "object" ? initialValues : {};
    setTransportNumber(clean(values.transportNumber || values.transportId || values.TransportNumber));
  }, [initialValues]);

  const missingFields = Array.isArray(pendingAction?.missingFields) ? pendingAction.missingFields : [];

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    const trimmed = clean(transportNumber).toUpperCase();
    if (!trimmed) {
      setError("Transport number is required.");
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
      await onSubmit?.({
        transportNumber: trimmed,
        systemId: clean(systemId),
        sapUser: clean(sapUser),
        sessionId: clean(sessionId),
        prompt: `import transport to production ${trimmed}`,
      });
    } catch (err) {
      setError(err?.message || "Failed to submit production import transport request.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Import Transport to Production</h2>
        <p className="mt-1 text-xs text-zinc-500">Enter the transport number and submit to run the production import flow.</p>
      </div>

      <div className="space-y-4 p-4">
        {error ? <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div> : null}

        {missingFields.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Missing fields: {missingFields.join(", ")}
          </div>
        ) : null}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Transport Number *</label>
          <input
            type="text"
            value={transportNumber}
            onChange={(e) => setTransportNumber(e.target.value)}
            placeholder="Enter transport number"
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm uppercase outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
          />
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
            type="submit"
            disabled={isLoading}
            className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800 disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isLoading ? "Importing..." : "Import to Production"}
          </button>
        </div>
      </div>
    </form>
  );
}
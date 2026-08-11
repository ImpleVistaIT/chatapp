import { useEffect, useMemo, useState } from "react";
import { authFetch } from "../api/authFetch";
import { API_BASE } from "../api/client";

function clean(value) {
  return String(value || "").trim();
}

function normalizeDeveloperList(values = []) {
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

function toYesNo(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  const text = clean(value).toLowerCase();
  if (["yes", "y", "true", "1"].includes(text)) return "yes";
  if (["no", "n", "false", "0"].includes(text)) return "no";
  return "";
}

export default function SolmanCreateTransportRequestForm({
  systemId = "",
  sapUser = "",
  sessionId = "",
  initialValues = {},
  pendingAction = null,
  onSuccess,
  onCancel,
}) {
  const [solmanChangeReq, setSolmanChangeReq] = useState("");
  const [trOwner, setTrOwner] = useState(clean(sapUser));
  const [client, setClient] = useState("");
  const [workbenchReq, setWorkbenchReq] = useState("");
  const [customizingReq, setCustomizingReq] = useState("");
  const [developers, setDevelopers] = useState([""]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const apiBase = useMemo(() => API_BASE, []);

  useEffect(() => {
    const values = initialValues && typeof initialValues === "object" ? initialValues : {};
    setSolmanChangeReq(clean(values.SolmanChangeReq || values.changeRequestId || values.changeRequest));
    setTrOwner(clean(values.TrOwner) || clean(sapUser));
    setClient(clean(values.Client));
    setWorkbenchReq(toYesNo(values.WorkbenchReq));
    setCustomizingReq(toYesNo(values.CustomizingReq));

    const developerValues = Array.isArray(values.DeveloperSet)
      ? values.DeveloperSet.map((item) => item?.Developer || item?.developer)
      : Array.isArray(values.developers)
        ? values.developers
        : [];

    const normalized = normalizeDeveloperList(developerValues);
    setDevelopers(normalized.length > 0 ? normalized : [""]);
  }, [initialValues, sapUser]);

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

    const cleanChangeRequest = clean(solmanChangeReq);
    const cleanOwner = clean(trOwner).toUpperCase();
    const cleanClient = clean(client);
    const cleanDevelopers = normalizeDeveloperList(developers);
    const hasWorkbench = toYesNo(workbenchReq) === "yes";
    const hasCustomizing = toYesNo(customizingReq) === "yes";

    if (!clean(systemId)) {
      setError("No active SAP system selected.");
      return;
    }

    if (!clean(sapUser)) {
      setError("No active SAP user found.");
      return;
    }

    if (
      !cleanChangeRequest ||
      !cleanOwner ||
      !cleanClient ||
      cleanDevelopers.length === 0 ||
      (!hasWorkbench && !hasCustomizing)
    ) {
      setError("Please fill all required fields.");
      return;
    }

    setIsLoading(true);

    try {
      const res = await authFetch(`${apiBase}/chat/actions/solman/create-transport-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemId: clean(systemId),
          sapUser: clean(sapUser),
          sessionId: clean(sessionId),
          payload: {
            SolmanChangeReq: cleanChangeRequest,
            TrOwner: cleanOwner,
            Client: cleanClient,
            WorkbenchReq: hasWorkbench,
            CustomizingReq: hasCustomizing,
            DeveloperSet: cleanDevelopers.map((Developer) => ({ Developer })),
          },
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok === false || data?.status === "execution_failed" || data?.status === "validation_failed") {
        throw new Error(data?.message || data?.error || "Failed to create transport request.");
      }

      onSuccess?.(data?.result || data);
      onCancel?.();
    } catch (e) {
      setError(e?.message || "Failed to create transport request.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">Create Transport Request</h2>
        <p className="mt-1 text-xs text-zinc-500">Fill the required SolMan transport request details below.</p>
      </div>

      <div className="space-y-4 p-4">
        {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}

        <div>
          <label className="mb-1 block text-xs font-medium text-zinc-700">Change Request Number *</label>
          <input type="text" value={solmanChangeReq} onChange={(e) => setSolmanChangeReq(e.target.value)} className={fieldClass("SolmanChangeReq")} placeholder="Enter change request number" />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Transport Owner *</label>
            <input type="text" value={trOwner} onChange={(e) => setTrOwner(e.target.value)} className={fieldClass("TrOwner")} placeholder="Enter transport owner" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Client *</label>
            <input type="text" value={client} onChange={(e) => setClient(e.target.value)} className={fieldClass("Client")} placeholder="Enter client" />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Workbench Request *</label>
            <select value={workbenchReq} onChange={(e) => setWorkbenchReq(e.target.value)} className={fieldClass("WorkbenchReq")}>
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">Customizing Request *</label>
            <select value={customizingReq} onChange={(e) => setCustomizingReq(e.target.value)} className={fieldClass("CustomizingReq")}>
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>
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
                className={fieldClass("DeveloperSet")}
              />
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onCancel} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-gray-50">Cancel</button>
          <button type="button" onClick={handleSubmit} disabled={isLoading} className="rounded-lg bg-green-700 px-4 py-2 text-sm font-semibold text-white hover:bg-green-800">{isLoading ? "Creating..." : "Create Transport Request"}</button>
        </div>
      </div>
    </div>
  );
}

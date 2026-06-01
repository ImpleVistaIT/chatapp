import { useEffect, useState } from "react";
import { authFetch } from "../api/authFetch";

function clean(v) {
  return String(v || "").trim();
}

export default function SolmanCreateCrForm({
  systemId = "",
  sapUser = "",
  initialValues = {},
  pendingAction = null,
  onSuccess,
  onCancel,
}) {
  const [shortDesc, setShortDesc] = useState("");
  const [deliveryResponsible, setDeliveryResponsible] = useState(clean(sapUser));
  const [developer, setDeveloper] = useState(clean(sapUser));
  const [tester, setTester] = useState(clean(sapUser));
  const [workItemReference, setWorkItemReference] = useState("");
  const [landscape, setLandscape] = useState("");
  const [url, setUrl] = useState("");
  const [urlName, setUrlName] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  const apiBase =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  useEffect(() => {
    const values =
      initialValues && typeof initialValues === "object" ? initialValues : {};

    setShortDesc(clean(values.ShortDesc));
    setDeliveryResponsible(
      clean(values.DeliveryResponsible) || clean(sapUser)
    );
    setDeveloper(clean(values.Developer) || clean(sapUser));
    setTester(clean(values.Tester) || clean(sapUser));
    setWorkItemReference(clean(values.WorkItemReference));
    setLandscape(clean(values.Landscape));

    const firstUrl = Array.isArray(values.REQ_URL_NAV)
      ? values.REQ_URL_NAV[0]
      : null;

    setUrl(clean(firstUrl?.URL));
    setUrlName(clean(firstUrl?.URL_NAME));
  }, [initialValues, sapUser]);

  function clearFieldError(field) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev;
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function applyBackendFieldHints(message) {
    const msg = clean(message).toLowerCase();
    const next = {};

    if (msg.includes("work item") && msg.includes("already exists")) {
      next.WorkItemReference = "This work item reference already exists.";
    }

    setFieldErrors(next);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setFieldErrors({});

    if (!clean(systemId)) {
      setError("No active SAP system selected.");
      return;
    }

    if (!clean(sapUser)) {
      setError("No active SAP user found.");
      return;
    }

    if (
      !clean(shortDesc) ||
      !clean(deliveryResponsible) ||
      !clean(developer) ||
      !clean(tester) ||
      !clean(workItemReference) ||
      !clean(landscape)
    ) {
      setError("Please fill all required fields.");

      const next = {};
      if (!clean(shortDesc)) next.ShortDesc = "Short Description is required.";
      if (!clean(deliveryResponsible)) {
        next.DeliveryResponsible = "Delivery Responsible is required.";
      }
      if (!clean(developer)) next.Developer = "Developer is required.";
      if (!clean(tester)) next.Tester = "Tester is required.";
      if (!clean(workItemReference)) {
        next.WorkItemReference = "Work Item Reference is required.";
      }
      if (!clean(landscape)) next.Landscape = "Landscape is required.";
      setFieldErrors(next);

      return;
    }

    const payload = {
      ShortDesc: clean(shortDesc),
      DeliveryResponsible: clean(deliveryResponsible),
      Developer: clean(developer),
      Tester: clean(tester),
      WorkItemReference: clean(workItemReference),
      Landscape: clean(landscape),
    };

    if (clean(url) && clean(urlName)) {
      payload.REQ_URL_NAV = [
        {
          URL: clean(url),
          URL_NAME: clean(urlName),
        },
      ];
    }

    console.log("Submitting create change request", {
      systemId: clean(systemId),
      sapUser: clean(sapUser),
      payload,
    });

    setIsLoading(true);

    try {
      const res = await authFetch(
        `${apiBase}/chat/actions/solman/create-change-request`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            systemId: clean(systemId),
            sapUser: clean(sapUser),
            payload,
          }),
        }
      );

      const data = await res.json().catch(() => ({}));

      if (
        !res.ok ||
        data?.ok === false ||
        data?.status === "execution_failed" ||
        data?.status === "validation_failed"
      ) {
        const message =
          data?.message ||
          data?.error?.message ||
          data?.error ||
          "Failed to create change request";

        setError(message);
        applyBackendFieldHints(message);
        return;
      }

      const result = data?.result || data;

      onSuccess?.({
        ...result,
        executor: data?.executor || null,
        message: data?.message || "Change request created successfully.",
      });
    } catch (err) {
      const message = err?.message || "Failed to create change request.";
      setError(message);
      applyBackendFieldHints(message);
    } finally {
      setIsLoading(false);
    }
  }

  const missingFields = Array.isArray(pendingAction?.missingFields)
    ? pendingAction.missingFields
    : [];

  function isMissing(field) {
    return missingFields.includes(field);
  }

  function inputClass(field) {
    if (fieldErrors[field]) {
      return "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 border-red-400 bg-red-50 focus:border-red-500 focus:ring-red-500/20";
    }

    if (isMissing(field)) {
      return "w-full rounded-lg border px-3 py-2 text-sm outline-none focus:ring-2 border-amber-400 bg-amber-50 focus:border-amber-500 focus:ring-amber-500/20";
    }

    return "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20";
  }

  return (
    <div className="mx-auto w-full max-w-4xl rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-zinc-900">
          Create SolMan Change Request
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Fill the required details below to create a change request.
        </p>
      </div>

      <div className="p-4">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {missingFields.length > 0 && (
          <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Missing fields: {missingFields.join(", ")}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Short Description *
            </label>
            <input
              type="text"
              value={shortDesc}
              onChange={(e) => {
                setShortDesc(e.target.value);
                clearFieldError("ShortDesc");
              }}
              placeholder="Enter short description"
              className={inputClass("ShortDesc")}
            />
            {fieldErrors.ShortDesc && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.ShortDesc}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Delivery Responsible *
              </label>
              <input
                type="text"
                value={deliveryResponsible}
                onChange={(e) => {
                  setDeliveryResponsible(e.target.value);
                  clearFieldError("DeliveryResponsible");
                }}
                placeholder="SAP user"
                className={inputClass("DeliveryResponsible")}
              />
              {fieldErrors.DeliveryResponsible && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.DeliveryResponsible}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Developer *
              </label>
              <input
                type="text"
                value={developer}
                onChange={(e) => {
                  setDeveloper(e.target.value);
                  clearFieldError("Developer");
                }}
                placeholder="SAP user"
                className={inputClass("Developer")}
              />
              {fieldErrors.Developer && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.Developer}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Tester *
              </label>
              <input
                type="text"
                value={tester}
                onChange={(e) => {
                  setTester(e.target.value);
                  clearFieldError("Tester");
                }}
                placeholder="SAP user"
                className={inputClass("Tester")}
              />
              {fieldErrors.Tester && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.Tester}
                </p>
              )}
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Work Item Reference *
              </label>
              <input
                type="text"
                value={workItemReference}
                onChange={(e) => {
                  setWorkItemReference(e.target.value);
                  clearFieldError("WorkItemReference");
                }}
                placeholder="e.g. 35645679"
                className={inputClass("WorkItemReference")}
              />
              {fieldErrors.WorkItemReference && (
                <p className="mt-1 text-xs text-red-600">
                  {fieldErrors.WorkItemReference}
                </p>
              )}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Landscape *
            </label>
            <input
              type="text"
              value={landscape}
              onChange={(e) => {
                setLandscape(e.target.value);
                clearFieldError("Landscape");
              }}
              placeholder="e.g. Z_DXB_ECC"
              className={inputClass("Landscape")}
            />
            {fieldErrors.Landscape && (
              <p className="mt-1 text-xs text-red-600">
                {fieldErrors.Landscape}
              </p>
            )}
          </div>

          <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
            <p className="mb-3 text-xs font-medium text-zinc-700">
              Optional Related URL
            </p>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  URL
                </label>
                <input
                  type="text"
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="https://example.com"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-medium text-zinc-700">
                  URL Name
                </label>
                <input
                  type="text"
                  value={urlName}
                  onChange={(e) => setUrlName(e.target.value)}
                  placeholder="URL1"
                  className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-2 border-t border-gray-100 pt-2">
            <button
              type="button"
              onClick={onCancel}
              disabled={isLoading}
              className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-gray-50 disabled:opacity-60"
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isLoading}
              className="rounded-lg bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:opacity-60"
            >
              {isLoading ? "Creating..." : "Create Change Request"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
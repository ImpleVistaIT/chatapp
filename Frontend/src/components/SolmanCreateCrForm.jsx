import { useState } from "react";
import { authFetch } from "../api/authFetch";

export default function SolmanCreateCrForm({
  systemId = "HSM",
  sapUser = "",
  onSuccess,
  onCancel,
}) {
  const [shortDesc, setShortDesc] = useState("");
  const [deliveryResponsible, setDeliveryResponsible] = useState(sapUser || "");
  const [developer, setDeveloper] = useState(sapUser || "");
  const [tester, setTester] = useState(sapUser || "");
  const [workItemReference, setWorkItemReference] = useState("");
  const [landscape, setLandscape] = useState("");
  const [url, setUrl] = useState("");
  const [urlName, setUrlName] = useState("");

  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const apiBase =
    import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (
      !shortDesc.trim() ||
      !deliveryResponsible.trim() ||
      !developer.trim() ||
      !tester.trim() ||
      !workItemReference.trim() ||
      !landscape.trim()
    ) {
      setError("Please fill all required fields.");
      return;
    }

    const payload = {
      ShortDesc: shortDesc.trim(),
      DeliveryResponsible: deliveryResponsible.trim(),
      Developer: developer.trim(),
      Tester: tester.trim(),
      WorkItemReference: workItemReference.trim(),
      Landscape: landscape.trim(),
    };

    if (url.trim() && urlName.trim()) {
      payload.REQ_URL_NAV = [
        {
          URL: url.trim(),
          URL_NAME: urlName.trim(),
        },
      ];
    }

    setIsLoading(true);

    try {
      const res = await authFetch(`${apiBase}/api/solman/change-request/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          systemId,
          sapUser,
          payload,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || data?.ok !== true) {
        throw new Error(data?.error || "Failed to create change request");
      }

      onSuccess?.(data);
    } catch (err) {
      setError(err?.message || "Failed to create change request.");
    } finally {
      setIsLoading(false);
    }
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
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
            {error}
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
              onChange={(e) => setShortDesc(e.target.value)}
              placeholder="Enter short description"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Delivery Responsible *
              </label>
              <input
                type="text"
                value={deliveryResponsible}
                onChange={(e) => setDeliveryResponsible(e.target.value)}
                placeholder="SAP user"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Developer *
              </label>
              <input
                type="text"
                value={developer}
                onChange={(e) => setDeveloper(e.target.value)}
                placeholder="SAP user"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Tester *
              </label>
              <input
                type="text"
                value={tester}
                onChange={(e) => setTester(e.target.value)}
                placeholder="SAP user"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium text-zinc-700">
                Work Item Reference *
              </label>
              <input
                type="text"
                value={workItemReference}
                onChange={(e) => setWorkItemReference(e.target.value)}
                placeholder="e.g. 35645679"
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
              />
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-zinc-700">
              Landscape *
            </label>
            <input
              type="text"
              value={landscape}
              onChange={(e) => setLandscape(e.target.value)}
              placeholder="e.g. Z_DXB_ECC"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm outline-none focus:border-green-600 focus:ring-2 focus:ring-green-600/20"
            />
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
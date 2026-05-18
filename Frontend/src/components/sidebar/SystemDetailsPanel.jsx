export default function SystemDetailsPanel({ open, onClose, system }) {
  if (!open) return null;

  // ✅ STRICT NORMALIZATION (no fake fallback)
  const sys = (() => {
    if (!system) return null;

    // ✅ Only accept VALID tile data
    if (system.system) {
      return {
        systemId: system.systemId || system.system.systemId || "",
        name: system.system.name || "",
        protocol: system.system.protocol || "",
        host: system.system.host || "",
        port: system.system.port ?? "",
        sapRouter: system.system.sapRouter || "",
        sapUser: system.sapUser || "",
      };
    }

    // ❌ If system.system missing → treat as INVALID
    return null;
  })();

  const rows = [
    ["Name", sys?.name],
    ["System ID", sys?.systemId],
    ["Protocol", sys?.protocol],
    ["Host", sys?.host],
    ["Port", sys?.port],
    ["SAP Router", sys?.sapRouter],
    ["SAP User", sys?.sapUser],
  ];

  return (
    <div className="absolute bottom-full left-0 right-0 mb-2 z-[60]">
      <div className="rounded-xl border border-gray-200 bg-white shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-gray-100">
          <div className="text-sm font-semibold text-zinc-800">
            System Details
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-3 py-1.5 text-xs font-semibold border border-gray-300 hover:bg-gray-50"
          >
            Close
          </button>
        </div>

        <div className="p-3 space-y-2 max-h-[60vh] overflow-y-auto">

          {/* 🚨 ERROR STATE (VERY IMPORTANT) */}
          {!sys && (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-[11px] text-red-700">
              ⚠️ System details not found.<br />
              Please reconfigure the system.
            </div>
          )}

          {/* ✅ NORMAL STATE */}
          {sys && (
            <>
              {/* Summary */}
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                <div className="text-xs font-semibold text-zinc-800 mb-1">
                  {sys.name || sys.systemId}
                </div>

                <div className="text-[11px] text-zinc-500">
                  {(sys.protocol || "-") +
                    "://" +
                    (sys.host || "-") +
                    ":" +
                    (sys.port ?? "-")}
                </div>
              </div>

              {/* Details */}
              <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
                {rows.map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between px-3 py-2 border-b border-gray-100 last:border-b-0"
                  >
                    <div className="text-[11px] font-semibold text-zinc-700">
                      {k}
                    </div>
                    <div
                      className="text-[11px] text-zinc-600 text-right max-w-[55%] truncate"
                      title={String(v ?? "")}
                    >
                      {v || "-"}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Note */}
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="text-[11px] font-semibold text-amber-800 mb-1">
              Note
            </div>
            <div className="text-[11px] text-amber-800">
              These are the currently selected system details.
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
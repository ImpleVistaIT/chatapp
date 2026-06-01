function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

export default function SystemsGrid({
  displaySystems,
  connectingSid,
  normalizeSid,
  setActiveSystemLocal,
  onDisconnectSystem = () => {},
}) {
  const systemsArr = Array.isArray(displaySystems) ? displaySystems : [];

  return (
    <div className="px-2 pb-3 flex-shrink-0 mt-auto">
      <div
        className={classNames(
          "grid grid-cols-2 gap-2",
          "max-h-[220px] overflow-y-auto pr-1",
          "[scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
        )}
      >
        {systemsArr.map((sys, i) => {
          const sid = normalizeSid(sys?.systemId || sys?.name);
          const status = String(sys?.status || "").trim().toLowerCase();

          const isConnected =
            sys?.connected === true ||
            sys?.isConnected === true ||
            status === "connected" ||
            status === "online" ||
            status === "active" ||
            sys?.active === true;

          const isConnecting = Boolean(connectingSid) && String(connectingSid) === sid;

          const label = sys?.name || sys?.description || sid || `System ${i + 1}`;

          return (
            <div
              key={sys?._id || sys?.id || sid || i}
              className={classNames(
                "group relative rounded-lg border-2 transition-all duration-150 overflow-hidden",
                isConnected
                  ? "border-green-400 bg-white text-zinc-800 hover:bg-green-50 shadow-sm"
                  : "border-red-400 bg-red-50 text-red-700 hover:bg-red-100"
              )}
            >
              <div
                className={classNames(
                  "w-full px-3 py-3 text-center font-medium rounded-lg transition",
                  isConnecting ? "cursor-wait opacity-70" : "cursor-default"
                )}
                title={
                  isConnected
                    ? `${label} is connected`
                    : `${label} is disconnected`
                }
              >
                <span
                  className={classNames(
                    "absolute top-1 right-1 text-[9px] px-1.5 py-0.5 rounded text-white",
                    isConnected ? "bg-green-600" : "bg-red-600"
                  )}
                >
                  {isConnected ? "Live" : "Disconnected"}
                </span>

                <span className="text-[11px] block truncate font-semibold">
                  {isConnecting ? "Connecting…" : label}
                </span>
              </div>

              {!isConnecting && (
                <div className="absolute inset-x-2 bottom-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  {isConnected ? (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onDisconnectSystem({
                          ...sys,
                          systemId: sid,
                          name: label,
                        });
                      }}
                      className="w-full rounded-md bg-red-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-red-700"
                      title={`Disconnect ${label}`}
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActiveSystemLocal({
                          ...sys,
                          systemId: sid,
                          name: label,
                          connected: false,
                          isConnected: false,
                          status: "disconnected",
                          active: false,
                        });
                      }}
                      className="w-full rounded-md bg-emerald-600 px-2 py-1 text-[10px] font-medium text-white hover:bg-emerald-700"
                      title={`Connect ${label}`}
                    >
                      Connect
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
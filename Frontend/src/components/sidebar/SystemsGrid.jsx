function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

import { FiCheckCircle, FiPower, FiServer } from "react-icons/fi";

export default function SystemsGrid({
  displaySystems,
  connectingSid,
  normalizeSid,
  setActiveSystemLocal,
  onDisconnectSystem = () => {},
}) {
  const systemsArr = Array.isArray(displaySystems) ? displaySystems : [];

  return (
    <div className="px-3 pb-4 flex-shrink-0 mt-auto">
      <div
        className={classNames(
          "grid grid-cols-2 gap-3",
          "max-h-[240px] overflow-y-auto pr-1",
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
                "group relative overflow-hidden rounded-[18px] border transition-all duration-200 ai-smooth shadow-sm",
                isConnected
                  ? "border-emerald-200 bg-white text-slate-800 hover:-translate-y-0.5 hover:shadow-[0_12px_30px_rgba(15,23,42,0.10)]"
                  : "border-rose-200 bg-rose-50/80 text-rose-700 hover:-translate-y-0.5 hover:bg-rose-50"
              )}
            >
              <div
                className={classNames(
                  "w-full px-3 py-3 text-left font-medium rounded-[18px] transition",
                  isConnecting ? "cursor-wait opacity-70" : "cursor-default"
                )}
                title={
                  isConnected
                    ? `${label} is connected`
                    : `${label} is disconnected`
                }
              >
                <div className="flex items-start gap-2">
                  <div className={classNames("mt-0.5 flex h-8 w-8 items-center justify-center rounded-xl", isConnected ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700")}>
                    <FiServer className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="text-[11px] block truncate font-semibold text-inherit">
                      {isConnecting ? "Connecting…" : label}
                    </span>
                    <span className="mt-0.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em]">
                      {isConnected ? <FiCheckCircle className="h-3 w-3" /> : <FiPower className="h-3 w-3" />}
                      {isConnected ? "Online" : "Offline"}
                    </span>
                  </div>
                </div>
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
                      className="w-full rounded-xl bg-slate-900 px-2 py-1.5 text-[10px] font-semibold text-white hover:bg-slate-800"
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
                      className="w-full rounded-xl bg-blue-600 px-2 py-1.5 text-[10px] font-semibold text-white hover:bg-blue-700"
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
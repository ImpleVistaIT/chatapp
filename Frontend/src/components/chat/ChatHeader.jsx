import { useMemo } from "react";
import { FiBell, FiMenu, FiPlus, FiSearch, FiSettings, FiUser } from "react-icons/fi";

function formatTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatHeader({
  setSidebarOpen,
  activeSession,
  onAddNewSystem,
  showAddSystemButton = false,
  tiles = [],
  normalizeSystemId = (value) => String(value || "").trim().toUpperCase(),
}) {
  const activeSystemId = String(activeSession?.systemId || "").trim();
  const activeTile = useMemo(() => {
    const sid = normalizeSystemId(activeSystemId);
    const list = Array.isArray(tiles) ? tiles : [];

    if (sid) {
      return (
        list.find((tile) => {
          const tileSid = normalizeSystemId(tile?.systemId || tile?.name || "");
          return tileSid && tileSid === sid;
        }) || null
      );
    }

    return (
      list.find((tile) => {
        const status = String(tile?.status || "").trim().toLowerCase();
        return (
          tile?.connected === true ||
          tile?.isConnected === true ||
          status === "connected" ||
          status === "online" ||
          status === "active"
        );
      }) || null
    );
  }, [activeSystemId, normalizeSystemId, tiles]);

  const isConnected = Boolean(
    activeTile &&
      (activeTile?.connected === true ||
        activeTile?.isConnected === true ||
        String(activeTile?.status || "").trim().toLowerCase() === "connected" ||
        String(activeTile?.status || "").trim().toLowerCase() === "online" ||
        String(activeTile?.status || "").trim().toLowerCase() === "active")
  );

  const statusText = isConnected ? "Connected" : "Disconnected";
  const systemText = isConnected ? "System online" : "System offline";

  const statusReference =
    activeTile?.connectedAt ||
    activeTile?.updatedAt ||
    activeTile?.credentialsUpdatedAt ||
    activeTile?.lastUsedAt ||
    null;

  const statusClock = statusReference
    ? new Date(statusReference).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    : formatTime();

  const systemLabel = String(activeTile?.name || activeSystemId || "SAP system").trim();

  return (
    <header className="ai-surface flex items-center justify-between gap-4 border-x-0 border-t-0 border-b border-slate-200/80 px-4 py-3 flex-shrink-0">
      <div className="flex min-w-0 items-center gap-3">
        <button
          onClick={() => setSidebarOpen?.((v) => !v)}
          className="rounded-xl border border-slate-200 bg-white/90 p-2 text-slate-600 shadow-sm ai-smooth hover:bg-slate-50 md:hidden"
          type="button"
        >
          <FiMenu className="h-5 w-5" />
        </button>

        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-semibold tracking-tight text-slate-900">
              SAP Enterprise AI Assistant
            </div>
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {systemLabel}
            </span>
          </div>
          <div className="mt-1 text-xs text-slate-600">
            {statusText} • {systemText} • {statusClock}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className="hidden items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-600 shadow-sm ai-smooth hover:bg-blue-50 hover:text-blue-700 md:inline-flex"
          title="Global Search"
        >
          <FiSearch className="h-4 w-4" />
          <span>Search</span>
        </button>

        <button
          type="button"
          className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm ai-smooth hover:bg-blue-50 hover:text-blue-700 md:inline-flex"
          title="Notifications"
        >
          <FiBell className="h-4 w-4" />
        </button>

        <button
          type="button"
          className="hidden h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 shadow-sm ai-smooth hover:bg-blue-50 hover:text-blue-700 md:inline-flex"
          title="Settings"
        >
          <FiSettings className="h-4 w-4" />
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-sm ai-smooth hover:bg-blue-50 hover:text-blue-700"
          title="User Profile"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-slate-900 text-white">
            <FiUser className="h-4 w-4" />
          </span>
          <span className="hidden sm:inline">Profile</span>
        </button>

        {showAddSystemButton && typeof onAddNewSystem === "function" && (
          <button
            type="button"
            onClick={() => onAddNewSystem()}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-xs font-semibold text-white shadow-sm ai-smooth hover:bg-blue-700"
          >
            <FiPlus className="text-sm" />
            Add System
          </button>
        )}
      </div>
    </header>
  );
}
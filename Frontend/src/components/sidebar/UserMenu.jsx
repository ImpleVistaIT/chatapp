import userImg from "../../assets/user.png";
import { FiPlus, FiSettings, FiShield, FiTrash2, FiUser } from "react-icons/fi";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

function normalizeSystemId(sid) {
  return String(sid || "").trim().toUpperCase();
}

function resolveAppDisplayName(userNameProp) {
  const fromStorage =
    String(localStorage.getItem("userName") || "").trim() ||
    String(localStorage.getItem("user") || "").trim();
  if (fromStorage) return fromStorage;

  const fromProp = String(userNameProp || "").trim();
  if (fromProp) return fromProp;

  return "";
}

export default function UserMenu({
  menuRef,
  userMenuOpen,
  setUserMenuOpen,
  showSystemDetails,
  setShowSystemDetails,
  systems = [],
  selectedSystemId = "",
  onSelectSystem = () => {},
  userName,
  onAddNewSystem,
  removeActiveSystem,
  activeSession,
}) {
  const hasSystems = Array.isArray(systems) && systems.length > 0;
  const selectedSystem = systems.find((system) => normalizeSystemId(system?.systemId) === normalizeSystemId(selectedSystemId)) || null;
  const hasSelection = Boolean(selectedSystem);

  const selectedSystemUserName = String(
    selectedSystem?.profileFullName ||
      selectedSystem?.system?.profileFullName ||
      selectedSystem?.sapUser ||
      ""
  ).trim();

  const fallbackSystemUserName = String(
    systems.find((system) => String(system?.profileFullName || system?.system?.profileFullName || "").trim())?.profileFullName ||
      systems.find((system) => String(system?.profileFullName || system?.system?.profileFullName || "").trim())?.system?.profileFullName ||
      ""
  ).trim();

  const primaryName = String(
    activeSession?.fullName ||
      selectedSystemUserName ||
      activeSession?.sapUser ||
      fallbackSystemUserName ||
      ""
  ).trim();

  const displayName = primaryName || normalizeSystemId(selectedSystem?.systemId || "") || "";
  const showEmptyState = !displayName && !hasSelection && !hasSystems;

  return (
    <div className="p-3 flex-shrink-0 relative">
      <div ref={menuRef} className="relative rounded-[18px] border border-slate-200 bg-white/90 p-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)] backdrop-blur-xl">
        <button
          onClick={() => {
            if (!hasSelection && !hasSystems) return;
            setUserMenuOpen((v) => !v);
          }}
          className={classNames(
            "flex items-center gap-3 w-full text-left rounded-2xl p-0 transition-all duration-150",
            hasSelection || hasSystems ? "hover:bg-slate-50" : "opacity-70 cursor-default"
          )}
          type="button"
          disabled={!hasSelection && !hasSystems}
          aria-disabled={!hasSelection && !hasSystems}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-slate-900 text-white shadow-sm">
            <FiUser className="h-5 w-5" />
          </div>

          <div className="flex flex-col min-w-0 flex-1 text-left">
            {showEmptyState ? (
              <>
                <span className="text-xs font-semibold text-slate-400 truncate">No active system</span>
                <div className="flex items-center gap-1 mt-0.5">
                  <span className="inline-flex items-center gap-1 text-[9px] font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded-full flex-shrink-0">
                    <FiShield className="h-3 w-3" />
                    Inactive
                  </span>
                </div>
              </>
            ) : (
              <>
                <span className="text-xs font-semibold text-slate-900 truncate">
                  {displayName}
                </span>

                <div className="flex items-center gap-1 mt-0.5">
                  {selectedSystem && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full flex-shrink-0">
                      <FiShield className="h-3 w-3" />
                      Active
                    </span>
                  )}
                </div>
              </>
            )}
          </div>

          {(hasSelection || hasSystems) && (
            <svg
              className={classNames(
                "w-3.5 h-3.5 text-slate-400 flex-shrink-0 transition-transform duration-200",
                userMenuOpen ? "rotate-180" : ""
              )}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <polyline points="18 15 12 9 6 15" />
            </svg>
          )}
        </button>

        {(hasSelection || hasSystems) && userMenuOpen && (
          <div className="absolute bottom-full left-0 w-72 rounded-[20px] border border-slate-200 bg-white shadow-[0_20px_50px_rgba(15,23,42,0.14)] z-50 mb-2 overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50">
              <div className="text-xs font-semibold text-slate-900">
                {displayName || "No active system"}
              </div>
            </div>

            <div className="py-2 text-xs">
              <button
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-slate-700 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={() => {
                  setUserMenuOpen(false);
                  setShowSystemDetails?.(true);
                }}
                type="button"
                disabled={!hasSystems}
                title={!hasSystems ? "No connected systems" : "System Details"}
              >
                <FiSettings className="h-3.5 w-3.5" />
                System Details
              </button>

              <button
                className="w-full text-left px-4 py-2.5 hover:bg-slate-50 text-slate-700 flex items-center gap-2"
                onClick={() => {
                  onAddNewSystem?.();
                  setUserMenuOpen(false);
                }}
                type="button"
              >
                <FiPlus className="h-3.5 w-3.5" />
                Add System
              </button>

              <button
                className="w-full text-left px-4 py-2.5 hover:bg-red-50 text-red-600 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
                onClick={() => {
                  setUserMenuOpen(false);
                  removeActiveSystem?.(selectedSystem);
                }}
                type="button"
                disabled={!hasSelection}
                title={!hasSelection ? "No system selected" : "Remove system"}
              >
                <FiTrash2 className="h-3.5 w-3.5" />
                Remove System
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
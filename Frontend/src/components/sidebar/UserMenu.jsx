import userImg from "../../assets/user.png";
import SystemDetailsPanel from "./SystemDetailsPanel.jsx";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

function normalizeSystemId(sid) {
  return String(sid || "").trim().toUpperCase();
}

// app display name fallback
function resolveAppDisplayName(userNameProp) {
  const fromStorage =
    String(localStorage.getItem("userName") || "").trim() ||
    String(localStorage.getItem("user") || "").trim();
  if (fromStorage) return fromStorage;

  const fromProp = String(userNameProp || "").trim();
  if (fromProp) return fromProp;

  return "User";
}

export default function UserMenu({
  menuRef,
  userMenuOpen,
  setUserMenuOpen,
  showSystemDetails,
  setShowSystemDetails,
  activeSystemData,
  userName,
  onAddNewSystem,
  removeActiveSystem,

  // ✅ single truth for active connection
  activeSession, // { systemId, sapUser, firstName?, fullName? } | null

  // ✅ tile object from /sap/tiles (has `system` inside)
  activeTile = null,
}) {
  const appName = resolveAppDisplayName(userName);

  const selectedSid = normalizeSystemId(activeSystemData?.systemId || activeSystemData?.name);
  const selectedSapUser = String(activeSystemData?.sapUser || "").trim();

  const activeSid = normalizeSystemId(activeSession?.systemId || "");
  const activeSapUser = String(activeSession?.sapUser || "").trim();

  const isConnected = Boolean(activeSid && activeSapUser);

  // ✅ allow menu actions when a system is selected (even if disconnected)
  const hasSelection = Boolean(selectedSid);

  // ✅ "Active" badge only if selected == active session (systemId + sapUser)
  const isActiveForSelected =
    Boolean(selectedSid && selectedSapUser) &&
    selectedSid === activeSid &&
    selectedSapUser === activeSapUser;

  const systemLabel =
    String(activeSystemData?.name || "").trim() ||
    String(activeSystemData?.systemId || "").trim() ||
    "";

  // ✅ Prefer Fullname/Firstname from activeSession (fallback to sapUser)
  const displayName =
    String(activeSession?.fullName || "").trim() ||
    String(activeSession?.firstName || "").trim() ||
    activeSapUser;

  // ✅ When connected show SAP person's name; when disconnected show app user name
  const primaryName = isConnected ? displayName : appName;

  // ✅ Secondary line: show actual connection target when connected, else show selected system (if any)
  const secondaryLine = isConnected
    ? systemLabel || activeSid || "Connected"
    : hasSelection
    ? systemLabel || selectedSid
    : "Disconnected";

  return (
    <div className="p-3 flex-shrink-0 relative">
      <SystemDetailsPanel
        open={showSystemDetails}
        onClose={() => setShowSystemDetails(false)}
        system={activeTile}
      />

      <div ref={menuRef} className="relative">
        <button
          onClick={() => {
            // ✅ allow opening menu when there is a selection OR connected
            if (!hasSelection && !isConnected) return;
            setUserMenuOpen((v) => !v);
          }}
          className={classNames(
            "flex items-center gap-3 w-full text-left p-2 rounded-xl transition-all duration-150",
            hasSelection || isConnected ? "hover:bg-gray-100" : "opacity-70 cursor-default"
          )}
          type="button"
          disabled={!hasSelection && !isConnected}
          aria-disabled={!hasSelection && !isConnected}
        >
          <img src={userImg} alt="user" className="w-9 h-9 rounded-full object-cover flex-shrink-0" />

          <div className="flex flex-col min-w-0 flex-1">
            <span className="text-xs font-semibold text-zinc-800 truncate">{primaryName}</span>

            <div className="flex items-center gap-1 mt-0.5">
              <span className="text-[11px] text-zinc-500 truncate flex-1">{secondaryLine}</span>

              {isActiveForSelected && (
                <span className="text-[9px] font-bold text-white bg-green-600 px-1.5 py-0.5 rounded-full flex-shrink-0">
                  Active
                </span>
              )}
            </div>
          </div>

          {(hasSelection || isConnected) && (
            <svg
              className={classNames(
                "w-3.5 h-3.5 text-zinc-400 flex-shrink-0 transition-transform duration-200",
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

        {(hasSelection || isConnected) && userMenuOpen && (
          <div className="absolute bottom-full left-0 w-64 bg-white border border-gray-200 rounded-xl shadow-lg z-50 mb-2">
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="text-xs font-semibold text-zinc-800">{primaryName}</div>
              <div className="text-[11px] text-gray-500">{secondaryLine}</div>
            </div>

            <div className="py-2 text-xs">
              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-50 text-zinc-700 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => {
                  setUserMenuOpen(false);
                  setShowSystemDetails(true);
                }}
                type="button"
                disabled={!isActiveForSelected}
                title={!isActiveForSelected ? "Connect to view system details" : "System Details"}
              >
                System Details
              </button>

              <button
                className="w-full text-left px-4 py-2 hover:bg-gray-50 text-zinc-700"
                onClick={() => {
                  onAddNewSystem?.();
                  setUserMenuOpen(false);
                }}
                type="button"
              >
                Add System
              </button>

              <button
                className="w-full text-left px-4 py-2 hover:bg-red-50 text-red-600 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={() => {
                  console.log("REMOVE BUTTON CLICKED");
                  setUserMenuOpen(false);
                  removeActiveSystem?.();
                }}
                type="button"
                disabled={!Boolean(selectedSid && selectedSapUser)}
                title={!Boolean(selectedSid && selectedSapUser) ? "No saved login selected" : "Remove saved login"}
              >
                Remove System
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
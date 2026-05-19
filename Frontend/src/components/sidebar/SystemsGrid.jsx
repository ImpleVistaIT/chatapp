function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

export default function SystemsGrid({
  displaySystems,
  connectingSid, // should be `${sid}:${sapUser}` or null
  normalizeSid,
  normalizeSapUser,
  setActiveSystemLocal,

  // ✅ connection truth (from Chat.jsx -> Sidebar.jsx)
  activeSession = null, // { systemId, sapUser } | null
}) {
  const systemsArr = Array.isArray(displaySystems) ? displaySystems : [];

  // ✅ active connection truth (what is actually connected)
  const activeSid = normalizeSid(activeSession?.systemId || "");
  const activeSapUser = normalizeSapUser(activeSession?.sapUser || "");
  const activeKey = activeSid && activeSapUser ? `${activeSid}:${activeSapUser}` : "";
  const isConnected = Boolean(activeKey);

  // ✅ NEW: when disconnected, disable ALL tiles
  const isDisconnected = !isConnected;

  return (
    // ✅ mt-auto pushes this block to bottom INSIDE the scroll area
    <div className="px-2 pb-3 flex-shrink-0 mt-auto">
      <div className={classNames("grid grid-cols-2 gap-2", "max-h-[220px] overflow-y-auto pr-1")}>
        {systemsArr.map((sys, i) => {
          const sid = normalizeSid(sys?.systemId || sys?.name);
          const sapUser = normalizeSapUser(sys?.sapUser || "");
          const tileKey = `${sid}:${sapUser}`;

          const isActive = Boolean(activeKey) && activeKey === tileKey;

          // ✅ connectingSid should be `${sid}:${sapUser}`
          const isConnecting = Boolean(connectingSid) && String(connectingSid) === tileKey;

          // ✅ block switching: if connected, user can only click the ACTIVE tile
          const isBlockedByActiveSession = isConnected && !isActive;

          // ✅ block all interaction when disconnected
          const isBlockedByDisconnected = isDisconnected;

          const isBlocked = isConnecting || isBlockedByActiveSession || isBlockedByDisconnected;

          const labelBase = sys?.name || sys?.description || sid || `System ${i + 1}`;
          const label = sapUser ? `${labelBase} (${sapUser})` : labelBase;

          return (
            <button
              key={sys._id || sys.id || tileKey}
              className={classNames(
                "relative px-3 py-2 rounded-lg border-2 transition-all duration-150 text-center font-medium",
                isActive
                  ? "border-green-500 bg-green-50 text-green-700 shadow-sm"
                  : "border-gray-300 bg-white text-zinc-800",
                isBlocked ? "cursor-not-allowed opacity-60" : "cursor-pointer hover:border-emerald-400 hover:bg-emerald-50",
                isConnecting && "opacity-70 cursor-wait"
              )}
              type="button"
              onClick={() => {
                if (isBlocked) return;
                setActiveSystemLocal(sys);
              }}
              title={
                isBlockedByDisconnected
                  ? "Connect first to use system tiles."
                  : isBlockedByActiveSession
                  ? "Disconnect current system to switch."
                  : label
              }
              disabled={isBlocked}
            >
              {isActive && !isConnecting && (
                <span className="absolute top-1 left-1 text-[9px] px-1.5 py-0.5 rounded bg-green-600 text-white">
                  Act..
                </span>
              )}

              <span className="text-[10px] block truncate">{isConnecting ? "Connecting…" : label}</span>

              {isBlockedByDisconnected && !isConnecting && (
                <span className="text-[8px] mt-1 block text-zinc-500">Connect to use</span>
              )}

              {isBlockedByActiveSession && (
                <span className="text-[8px] mt-1 block text-zinc-500">Disconnect to switch</span>
              )}

              {sys?.hasCredentials === false && !isConnecting && !isBlockedByActiveSession && !isBlockedByDisconnected && (
                <span className="text-[9px] mt-1 block text-amber-700">Login required</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
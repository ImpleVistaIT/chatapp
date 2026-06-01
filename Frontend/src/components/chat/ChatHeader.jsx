import menuIcon from "../../assets/hamberger.png";
import { FiPlus } from "react-icons/fi";

function formatTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatHeader({
  setSidebarOpen,
  activeSession,
  onAddNewSystem,
  showAddSystemButton = false,
}) {
  const activeSapUser = String(activeSession?.sapUser || "").trim();

  return (
    <header className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
      <div className="flex items-center gap-3">
        <button
          onClick={() => setSidebarOpen?.((v) => !v)}
          className="p-2 rounded-lg hover:bg-gray-200 md:hidden"
          type="button"
        >
          <img src={menuIcon} className="w-6 h-6" alt="menu" />
        </button>

        <div>
          <div className="text-sm font-semibold">SAP Assistant</div>
          <div className="text-xs text-zinc-500">
            {activeSapUser ? `Connected (${activeSapUser})` : "Connected"} • {formatTime()}
          </div>
        </div>
      </div>

      {showAddSystemButton && typeof onAddNewSystem === "function" && (
        <button
          type="button"
          onClick={() => onAddNewSystem()}
          className="inline-flex items-center gap-2 rounded-xl bg-green-700 px-4 py-2 text-xs font-semibold text-white shadow-sm transition-all duration-200 hover:bg-green-600"
        >
          <FiPlus className="text-sm" />
          Add System
        </button>
      )}
    </header>
  );
}

// import menuIcon from "../../assets/hamberger.png";
// import { FiChevronDown } from "react-icons/fi";
// import { toast } from "react-hot-toast";

// function classNames(...x) {
//   return x.filter(Boolean).join(" ");
// }

// function formatTime(d = new Date()) {
//   return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
// }

// function formatRelative(ts) {
//   const t = ts ? new Date(ts).getTime() : 0;
//   if (!t || Number.isNaN(t)) return "";
//   const diffMs = Date.now() - t;
//   const mins = Math.floor(diffMs / 60000);
//   if (mins < 1) return "just now";
//   if (mins < 60) return `${mins} min ago`;
//   const hrs = Math.floor(mins / 60);
//   if (hrs < 24) return `${hrs} hr ago`;
//   const days = Math.floor(hrs / 24);
//   return `${days} day${days === 1 ? "" : "s"} ago`;
// }

// export default function ChatHeader({
//   setSidebarOpen,
//   showSystemDropdown,
//   setShowSystemDropdown,
//   connectingSystemId,

//   // tiles (system + sapUser)
//   tiles = [],

//   normalizeSystemId,
//   handleSystemSelect,
//   onDisconnect,

//   // open SapLogin directly
//   onAddNewSystem,

//   // single source of truth
//   activeSession,
//   setActiveSession,
// }) {
//   const tileList = Array.isArray(tiles) ? tiles : [];

//   const activeSid =
//     normalizeSystemId?.(activeSession?.systemId) ||
//     String(activeSession?.systemId || "").trim().toUpperCase();

//   const activeSapUser = String(activeSession?.sapUser || "").trim();

//   const isConnected = Boolean(activeSid && activeSapUser);

//   // ✅ only show Connect button when we have saved tiles (credentials)
//   const showConnect = tileList.length > 0;

//   return (
//     <header className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3 flex-shrink-0">
//       {/* LEFT */}
//       <div className="flex items-center gap-3">
//         <button
//           onClick={() => setSidebarOpen?.((v) => !v)}
//           className="p-2 rounded-lg hover:bg-gray-200 md:hidden"
//           type="button"
//         >
//           <img src={menuIcon} className="w-6 h-6" alt="menu" />
//         </button>

//         <div>
//           <div className="text-sm font-semibold">SAP Assistant</div>
//           <div className="text-xs text-zinc-500">
//             {isConnected ? `Connected (${activeSapUser})` : "Disconnected"} • {formatTime()}
//           </div>
//         </div>
//       </div>

//       {/* RIGHT */}
//       {isConnected ? (
//         <button
//           type="button"
//           onClick={async () => {
//             try {
//               await onDisconnect?.();
//             } finally {
//               setActiveSession?.(null);
//               localStorage.removeItem("sapActiveSession");
//               localStorage.removeItem("sapActiveSystem");
//               localStorage.removeItem("chatSessionId");
//               window.dispatchEvent(new Event("sapActiveSessionChanged"));
//               window.dispatchEvent(new Event("chatSessionsChanged"));
//               toast(`Disconnected (${activeSapUser || "user"})`);
//             }
//           }}
//           className="rounded-xl bg-rose-600 px-3 py-2 text-xs font-semibold text-white hover:bg-rose-700 transition-all duration-200"
//         >
//           Disconnect ({activeSapUser || "active"})
//         </button>
//       ) : (
//         <div className="relative flex items-center gap-2">
//           {/* ✅ hide connect button when no tiles */}
//           {showConnect && (
//             <button
//               type="button"
//               onClick={() => setShowSystemDropdown((v) => !v)}
//               className="rounded-xl bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 transition-all duration-200 flex items-center gap-2"
//               disabled={Boolean(connectingSystemId)}
//             >
//               {connectingSystemId ? "Connecting..." : "Connect"}
//               <FiChevronDown
//                 className={classNames(
//                   "w-4 h-4 transition-transform duration-200",
//                   showSystemDropdown ? "rotate-180" : ""
//                 )}
//               />
//             </button>
//           )}

//           {typeof onAddNewSystem === "function" && (
//             <button
//               type="button"
//               onClick={() => onAddNewSystem()}
//               className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-zinc-800 border border-gray-300 hover:bg-gray-50 transition-all duration-200"
//             >
//               Add System
//             </button>
//           )}

//           {/* ✅ only render dropdown when connect button exists */}
//           {showConnect && showSystemDropdown && (
//             <div className="absolute right-0 top-full mt-2 w-72 bg-white border border-gray-300 rounded-xl shadow-lg z-50 overflow-hidden">
//               <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
//                 <p className="text-xs font-semibold text-gray-700">Select System to Connect</p>
//                 <p className="text-[10px] text-gray-500 mt-0.5">Choose a system and SAP user</p>
//               </div>

//               <div className="max-h-72 overflow-y-auto">
//                 {tileList.map((t, idx) => {
//                   const sid = normalizeSystemId(t?.systemId || t?.system?.systemId || t?.name);
//                   const sapUser = String(t?.sapUser || t?.system?.sapUser || t?.user || "").trim();

//                   const sysName = t?.system?.name || t?.name || t?.description || sid || `System ${idx + 1}`;
//                   const label = sapUser ? `${sysName} (${sapUser})` : sysName;

//                   const lastUsedAt = t?.lastUsedAt || null;
//                   const recentText = lastUsedAt ? `Recently connected (${formatRelative(lastUsedAt)})` : "";

//                   return (
//                     <button
//                       key={t?.key || t?._id || t?.id || `${sid}:${sapUser}` || idx}
//                       onClick={async () => {
//                         try {
//                           await handleSystemSelect?.({
//                             ...t,
//                             systemId: sid,
//                             sapUser,
//                             system: t?.system || t,
//                           });
//                           setShowSystemDropdown(false);
//                         } catch (e) {
//                           toast.error(String(e?.message || "Connect failed"));
//                         }
//                       }}
//                       className="w-full text-left px-4 py-3 hover:bg-emerald-50 transition-colors duration-150 border-b border-gray-100 last:border-b-0 flex items-center justify-between group"
//                       type="button"
//                       disabled={Boolean(connectingSystemId)}
//                       title={label}
//                     >
//                       <div className="flex flex-col gap-1 min-w-0">
//                         <span className="text-sm font-semibold text-zinc-800 group-hover:text-emerald-700 truncate">
//                           {label}
//                         </span>
//                         {sid && <span className="text-[10px] text-zinc-500 font-medium">SID: {sid}</span>}
//                         {recentText ? <span className="text-[10px] text-blue-700 font-medium">{recentText}</span> : null}
//                       </div>

//                       <div
//                         className={classNames(
//                           "w-2 h-2 rounded-full flex-shrink-0",
//                           lastUsedAt ? "bg-blue-500" : "bg-gray-300"
//                         )}
//                       />
//                     </button>
//                   );
//                 })}
//               </div>

//               <div className="px-4 py-3 bg-blue-50 border-t border-gray-200">
//                 <p className="text-[10px] text-blue-700 font-medium">
//                   All saved credentials remain selectable after disconnect.
//                 </p>
//               </div>
//             </div>
//           )}
//         </div>
//       )}
//     </header>
//   );
// }
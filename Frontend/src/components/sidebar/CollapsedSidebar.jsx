import userImg from "../../assets/user.png";
import newChatIcon from "../../assets/new-chat.png";
import searchIcon from "../../assets/search.png";
import plusIcon from "../../assets/plus.png";

function CollapsedIconBtn({ onClick, tooltip, children }) {
  return (
    <div className="relative group/tip flex justify-center w-full py-1">
      <button
        type="button"
        onClick={onClick}
        className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-200 transition-colors duration-150 flex-shrink-0"
      >
        {children}
      </button>

      <div
        className={[
          "pointer-events-none",
          "absolute left-full top-1/2 -translate-y-1/2 ml-3",
          "bg-zinc-800 text-white text-xs font-medium",
          "px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg",
          "opacity-0 scale-95 origin-left",
          "group-hover/tip:opacity-100 group-hover/tip:scale-100",
          "transition-all duration-150 ease-out z-[9999]",
        ].join(" ")}
      >
        {tooltip}
        <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-800" />
      </div>
    </div>
  );
}

export default function CollapsedSidebar({
  onNewChatWithToast,
  onAddNewSystem,
  userName,
  activeSystemData,

  // ✅ active SAP connection
  activeSession = null,

  // ✅ NEW: saved systems / tiles count
  displaySystems = [],
}) {
  const sapUser = String(activeSession?.sapUser || "").trim();
  const systemId = String(activeSession?.systemId || "").trim();

  const isConnected = Boolean(sapUser && systemId);

  // ✅ how many saved systems exist
  const hasSystems = Array.isArray(displaySystems) && displaySystems.length > 0;

  // ✅ tooltip logic
  const tooltipText = isConnected
    ? `${sapUser} @ ${systemId}`
    : hasSystems
    ? "You're disconnected from SAP. Connect to start chatting."
    : "No SAP system configured yet. Please add a system to start chatting.";

  return (
    <div className="h-full flex flex-col">
      {/* TOP ICONS */}
      <div className="flex flex-col items-center gap-0.5 pt-2 pb-3 px-1">
        <CollapsedIconBtn onClick={onNewChatWithToast} tooltip="New chat">
          <img src={newChatIcon} className="w-4 h-4" alt="new chat" />
        </CollapsedIconBtn>

        <CollapsedIconBtn tooltip="Search chats">
          <img src={searchIcon} className="w-4 h-4" alt="search" />
        </CollapsedIconBtn>

        <CollapsedIconBtn onClick={() => onAddNewSystem?.()} tooltip="Add new system">
          <img src={plusIcon} className="w-4 h-4" alt="add new system" />
        </CollapsedIconBtn>
      </div>

      <div className="h-px bg-gray-200 flex-shrink-0 mx-1" />

      {/* BOTTOM USER */}
      <div className="mt-auto flex-shrink-0 p-2 flex justify-center">
        <div className="relative group/tip">
          <img
            src={userImg}
            alt="user"
            className="w-8 h-8 rounded-full object-cover cursor-pointer ring-2 ring-transparent hover:ring-gray-300 transition-all duration-150"
          />

          <div
            className={[
              "pointer-events-none",
              "absolute left-full top-1/2 -translate-y-1/2 ml-3",
              "bg-zinc-800 text-white text-xs font-medium",
              "px-2.5 py-1.5 rounded-lg whitespace-nowrap shadow-lg",
              "opacity-0 scale-95 origin-left",
              "group-hover/tip:opacity-100 group-hover/tip:scale-100",
              "transition-all duration-150 ease-out z-[9999]",
            ].join(" ")}
          >
            {tooltipText}
            <span className="absolute right-full top-1/2 -translate-y-1/2 border-4 border-transparent border-r-zinc-800" />
          </div>
        </div>
      </div>
    </div>
  );
}
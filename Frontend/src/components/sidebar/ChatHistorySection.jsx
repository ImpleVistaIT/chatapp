import { useEffect, useState, useRef } from "react";
import chatIcon from "../../assets/new-chat.png";
import { toast } from "react-hot-toast";
 
/**
 * Joins css classes, ignoring falsy.
 */
function classNames(...x) {
  return x.filter(Boolean).join(" ");
}
 
/**
 * Checks if a sapActiveSystem exists in localStorage.
 */
function hasActiveSystem() {
  try {
    const s = JSON.parse(window.localStorage.getItem("sapActiveSystem") || "null");
    return Boolean(s?.systemId || s?.name);
  } catch {
    return false;
  }
}
 
/**
 * Chat history sidebar/component.
 */
export default function ChatHistorySection({
  onNewChatWithToast,
  sessions,
  sessionsLoading,
  sessionsHasMore,
  onSessionsScroll,
  activeId,
  setActiveId,
  editingChatId,
  editingTitle,
  menuOpenId,
  setEditingChatId,
  setEditingTitle,
  setMenuOpenId,
  cancelRename,
  renameSessionApi,
  deleteSessionApi,
  fetchSessions,
  handleDelete,
  currentSystemId,
}) {
  // Control visibility per sapActiveSystem
  const [showHistory, setShowHistory] = useState(() => hasActiveSystem());
 
  useEffect(() => {
    const onSapSessionChanged = () => {
      setShowHistory(hasActiveSystem());
    };
    window.addEventListener("sapActiveSessionChanged", onSapSessionChanged);
    return () =>
      window.removeEventListener("sapActiveSessionChanged", onSapSessionChanged);
  }, []);
 
  // Prevent duplicate rename/delete submits
  const [renaming, setRenaming] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
 
  // Focus ref for menu accessibility
  const menuButtonRefs = useRef({});
 
  const handleRename = async (id, title) => {
    setRenaming(true);
    const tid = toast.loading("Renaming...");
    try {
      await renameSessionApi(id, title);
      toast.success("Renamed", { id: tid });
      fetchSessions?.({ reset: true });
    } catch (e) {
      toast.error(e?.message || "Rename failed", { id: tid });
    } finally {
      setEditingChatId(null);
      setMenuOpenId(null);
      setRenaming(false);
    }
  };
 
  const handleDeleteSession = async (id) => {
    setDeletingId(id);
    const tid = toast.loading("Deleting chat...");
    try {
      await deleteSessionApi(id);
      toast.success("Deleted", { id: tid });
    } catch (e) {
      toast.error(e?.message || "Delete failed", { id: tid });
    } finally {
      setMenuOpenId(null);
      setDeletingId(null);
      if (String(activeId) === String(id)) setActiveId("draft");
      fetchSessions?.({ reset: true });
      handleDelete?.(id);
    }
  };
 
  // Accessible menu - closes on blur
  const handleMenuBlur = (event, id) => {
    // Close only if focus has left dropdown completely
    setTimeout(() => {
      const active = document.activeElement;
      if (
        !active ||
        !menuButtonRefs.current[id] ||
        (!menuButtonRefs.current[id]?.contains(active) &&
          !active.closest?.(`[data-menu-for="${id}"]`))
      ) {
        setMenuOpenId(null);
      }
    }, 0);
  };
 
  if (!showHistory) return null;
 
  // Render a single chat session row
  const renderChatItem = (c, index) => {
    const id = String(c._id);
    const isActive = id === String(activeId);
 
    const isRenaming = editingChatId === id;
 
    return (
      <div
        key={id}
        onMouseEnter={() => setMenuOpenId(id)}
        onMouseLeave={() => setMenuOpenId(null)}
        className={classNames(
          "relative group flex items-center justify-between rounded-lg px-3 py-2 mb-1",
          "transition-all duration-150",
          isActive
            ? "bg-blue-100 text-blue-700"
            : "hover:bg-blue-50 text-zinc-800"
        )}
      >
        {/* Edit mode */}
        {isRenaming ? (
          <input
            value={editingTitle}
            autoFocus
            disabled={renaming}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={async () => {
              if (renaming) return; // prevent double
              const title = editingTitle.trim() || "New chat";
              await handleRename(id, title);
            }}
            onKeyDown={async (e) => {
              if (renaming) return;
              if (e.key === "Enter") {
                e.preventDefault();
                const title = editingTitle.trim() || "New chat";
                await handleRename(id, title);
              }
              if (e.key === "Escape") {
                e.preventDefault();
                cancelRename?.();
                setEditingChatId(null);
                setMenuOpenId(null);
              }
            }}
            className="flex-1 text-xs px-2 py-1 rounded border border-blue-400 outline-none focus:border-blue-500"
            aria-label="Rename chat session"
          />
        ) : (
          <button
            onClick={() => {
              setActiveId(id);
              localStorage.setItem(
                "chatContext",
                JSON.stringify({
                  chatSessionId: id,
                  systemId: currentSystemId,
                })
              );
            }}
            type="button"
            className="w-full flex-1 text-left text-xs truncate px-1 py-1"
            title={c.title || "New chat"}
            tabIndex={0}
            aria-label={`Select chat: ${c.title || "New chat"}`}
          >
            {c.title || "New chat"}
          </button>
        )}
 
        {/* Menu button (always visible for keyboard nav) */}
        {!isRenaming && (
          <button
            onClick={() => setMenuOpenId(menuOpenId === id ? null : id)}
            ref={(el) => (menuButtonRefs.current[id] = el)}
            className={classNames(
              "group-hover:opacity-100 hover:opacity-100 p-1 rounded hover:bg-gray-300 transition-all duration-150 text-zinc-500 flex-shrink-0",
              "focus:opacity-100 opacity-75"
            )}
            aria-haspopup="menu"
            aria-expanded={menuOpenId === id}
            aria-controls={`chat-dropdown-${id}`}
            aria-label={`Show menu for ${c.title || "New chat"}`}
            tabIndex={0}
            type="button"
            onBlur={(e) => handleMenuBlur(e, id)}
          >
            ⋮
          </button>
        )}
 
        {/* Dropdown */}
        {menuOpenId === id && (
          <div
            className={classNames(
              "absolute right-2 w-32 bg-white border border-gray-200 rounded-lg shadow-lg z-[9999]",
              index >= sessions.length - 2 ? "bottom-8" : "top-8"
            )}
            id={`chat-dropdown-${id}`}
            data-menu-for={id}
            tabIndex={-1}
            onBlur={(e) => handleMenuBlur(e, id)}
          >
            <button
              onClick={() => {
                setEditingChatId(id);
                setEditingTitle(c.title || "New chat");
                setMenuOpenId(null);
              }}
              className="w-full text-left px-3 py-2 text-xs hover:bg-gray-100 rounded-t-lg transition-colors"
              type="button"
              aria-label="Start renaming chat"
              tabIndex={0}
            >
              Rename
            </button>
            <button
              onClick={() => handleDeleteSession(id)}
              className={classNames(
                "w-full text-left px-3 py-2 text-xs text-red-500 hover:bg-red-50 rounded-b-lg transition-colors",
                deletingId === id && "opacity-50 pointer-events-none"
              )}
              type="button"
              disabled={deletingId === id}
              aria-label="Delete chat"
              tabIndex={0}
            >
              {deletingId === id ? "Deleting..." : "Delete"}
            </button>
          </div>
        )}
      </div>
    );
  };
 
  return (
    <div className="flex flex-col h-full min-h-0 overflow-visible">
      {/* NEW CHAT */}
      <button
        onClick={onNewChatWithToast}
        type="button"
        className="mx-2 mt-3 flex items-center gap-2 rounded-xl px-3 py-2 text-zinc-800 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150 active:scale-[0.98] flex-shrink-0"
        aria-label="Start a new chat"
      >
        <img src={chatIcon} className="w-5 h-5" alt="New chat" />
        <span className="text-xs font-medium">New chat</span>
      </button>
 
      <div className="px-4 pt-4 pb-2 text-[9px] font-semibold tracking-widest text-zinc-400 uppercase flex-shrink-0">
        Your chats
      </div>
 
      {/* LIST */}
      <div
        className="flex-1 min-h-0 overflow-y-auto scroll-smooth relative overflow-visible"
        onScroll={onSessionsScroll}
        aria-label="Chat session list"
        tabIndex={0}
      >
        <div className="px-2 pb-3">
          {sessions.length === 0 ? (
            <div className="flex items-center justify-center h-full text-zinc-400 text-xs">
              {sessionsLoading ? "Loading..." : "No chats yet"}
            </div>
          ) : (
            sessions.map(renderChatItem)
          )}
 
          {sessionsLoading && sessions.length > 0 && (
            <div className="text-[11px] text-zinc-400 px-3 py-2">
              Loading more…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
 
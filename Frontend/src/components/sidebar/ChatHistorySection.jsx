import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { FiEdit3, FiTrash2, FiMoreVertical } from "react-icons/fi";
import chatIcon from "../../assets/new-chat.png";
import { toast } from "react-hot-toast";

/**
 * Joins css classes, ignoring falsy.
 */
function classNames(...x) {
  return x.filter(Boolean).join(" ");
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
  showHistory = true,
}) {
  //---------------------------------------------//
  // Local state
  //---------------------------------------------//
  const [renaming, setRenaming] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });

  //---------------------------------------------//
  // Refs
  //---------------------------------------------//
  const menuButtonRefs = useRef({});
  const menuRefs = useRef({});

  //---------------------------------------------//
  // Rename logic
  //---------------------------------------------//
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

  //---------------------------------------------//
  // Delete logic
  //---------------------------------------------//
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

  //---------------------------------------------//
  // Menu positioning logic
  //---------------------------------------------//
  const updateMenuPosition = (id) => {
    const btn = menuButtonRefs.current[id];
    if (!btn) return;

    const rect = btn.getBoundingClientRect();
    const menuWidth = 176;
    const menuHeight = 104;
    const gap = 6;

    const openUp = window.innerHeight - rect.bottom < menuHeight + 16;

    const top = openUp
      ? rect.top - menuHeight - gap
      : rect.bottom + gap;

    const left = rect.right - menuWidth;

    setMenuPosition({
      top: Math.max(8, top),
      left: Math.max(8, left),
    });
  };

  //---------------------------------------------//
  // Blur / outside-close logic
  //---------------------------------------------//
  const handleMenuBlur = (event, id) => {
    setTimeout(() => {
      const active = document.activeElement;
      const buttonEl = menuButtonRefs.current[id];
      const menuEl = menuRefs.current[id];

      if (!active || (!buttonEl?.contains(active) && !menuEl?.contains(active))) {
        setMenuOpenId(null);
      }
    }, 0);
  };

  useEffect(() => {
    const onDocClick = (e) => {
      const target = e.target;
      const openId = menuOpenId;
      if (!openId) return;

      const buttonEl = menuButtonRefs.current[openId];
      const menuEl = menuRefs.current[openId];

      if (buttonEl?.contains(target) || menuEl?.contains(target)) {
        return;
      }

      setMenuOpenId(null);
    };

    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpenId, setMenuOpenId]);

  useEffect(() => {
    if (!menuOpenId) return;

    const sync = () => updateMenuPosition(menuOpenId);

    sync();
    window.addEventListener("resize", sync);
    window.addEventListener("scroll", sync, true);

    return () => {
      window.removeEventListener("resize", sync);
      window.removeEventListener("scroll", sync, true);
    };
  }, [menuOpenId]);

  if (!showHistory) return null;

  //---------------------------------------------//
  // Single row renderer
  //---------------------------------------------//
  const renderChatItem = (c) => {
    const id = String(c._id);
    const isActive = id === String(activeId);
    const isRenaming = editingChatId === id;
    const isMenuOpen = menuOpenId === id;

    return (
      <div
        key={id}
        className={classNames(
          "relative group flex items-center justify-between rounded-xl px-3 py-2 mb-1 transition-all duration-150",
          isActive
            ? "bg-blue-100 text-blue-700"
            : "hover:bg-blue-50 text-zinc-800"
        )}
      >
        {/* Active indicator line */}
        {isActive && (
          <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-blue-600" />
        )}

        {/* Edit mode */}
        {isRenaming ? (
          <input
            value={editingTitle}
            autoFocus
            disabled={renaming}
            onChange={(e) => setEditingTitle(e.target.value)}
            onBlur={async () => {
              if (renaming) return;
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
            className="ml-2 flex-1 text-xs px-2 py-1 rounded border border-blue-400 outline-none focus:border-blue-500 bg-white"
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
            className={classNames(
              "w-full flex-1 text-left text-xs truncate px-1 py-1",
              isActive ? "ml-2 font-medium" : ""
            )}
            title={c.title || "New chat"}
            tabIndex={0}
            aria-label={`Select chat: ${c.title || "New chat"}`}
          >
            {c.title || "New chat"}
          </button>
        )}

        {/* Menu button */}
        {!isRenaming && (
          <button
            onClick={() => {
              const next = menuOpenId === id ? null : id;
              setMenuOpenId(next);
              if (next) {
                requestAnimationFrame(() => updateMenuPosition(id));
              }
            }}
            ref={(el) => (menuButtonRefs.current[id] = el)}
            className={classNames(
              "p-1.5 rounded-lg transition-all duration-150 flex-shrink-0",
              isMenuOpen
                ? "opacity-100 bg-gray-200 text-zinc-700"
                : "opacity-75 group-hover:opacity-100 text-zinc-500 hover:bg-gray-200"
            )}
            aria-haspopup="menu"
            aria-expanded={isMenuOpen}
            aria-controls={`chat-dropdown-${id}`}
            aria-label={`Show menu for ${c.title || "New chat"}`}
            tabIndex={0}
            type="button"
            onBlur={(e) => handleMenuBlur(e, id)}
          >
            <FiMoreVertical className="h-4 w-4" />
          </button>
        )}
      </div>
    );
  };

  //---------------------------------------------//
  // Portal dropdown render
  //---------------------------------------------//
  const openSession = sessions.find(
    (s) => String(s._id) === String(menuOpenId)
  );

  const portalMenu =
    menuOpenId && openSession
      ? createPortal(
          <div
            ref={(el) => (menuRefs.current[menuOpenId] = el)}
            id={`chat-dropdown-${menuOpenId}`}
            data-menu-for={menuOpenId}
            tabIndex={-1}
            onBlur={(e) => handleMenuBlur(e, menuOpenId)}
            className="fixed w-44 bg-white border border-gray-200 rounded-xl shadow-xl z-[999999] overflow-hidden"
            style={{
              top: `${menuPosition.top}px`,
              left: `${menuPosition.left}px`,
            }}
          >
            {/* RENAME */}
            <button
              onClick={() => {
                setEditingChatId(menuOpenId);
                setEditingTitle(openSession.title || "New chat");
                setMenuOpenId(null);
              }}
              className="w-full flex items-center gap-3 text-left px-4 py-3 text-xs text-zinc-700 hover:bg-gray-50 transition-colors"
              type="button"
              aria-label="Start renaming chat"
              tabIndex={0}
            >
              <FiEdit3 className="h-4 w-4 text-zinc-500" />
              <span>Rename</span>
            </button>

            {/* SPLIT LINE */}
            <div className="border-t border-gray-200" />

            {/* DELETE */}
            <button
              onClick={() => handleDeleteSession(menuOpenId)}
              className={classNames(
                "w-full flex items-center gap-3 text-left px-4 py-3 text-xs text-red-500 hover:bg-red-50 transition-colors",
                deletingId === menuOpenId && "opacity-50 pointer-events-none"
              )}
              type="button"
              disabled={deletingId === menuOpenId}
              aria-label="Delete chat"
              tabIndex={0}
            >
              <FiTrash2 className="h-4 w-4" />
              <span>{deletingId === menuOpenId ? "Deleting..." : "Delete"}</span>
            </button>
          </div>,
          document.body
        )
      : null;

  //---------------------------------------------//
  // Render
  //---------------------------------------------//
  return (
    <>
      <div className="flex flex-col h-full min-h-0">
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
          className="flex-1 min-h-0 overflow-y-auto scroll-smooth relative"
          onScroll={onSessionsScroll}
          aria-label="Chat session list"
          tabIndex={0}
        >
          <div className="px-2 pb-3 relative">
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

      {portalMenu}
    </>
  );
}
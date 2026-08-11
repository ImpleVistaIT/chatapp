import { useEffect, useMemo, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { FiClock, FiEdit3, FiMessageSquare, FiMoreVertical, FiPlus, FiTrash2 } from "react-icons/fi";
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

  const groupedSessions = useMemo(() => {
    const items = Array.isArray(sessions) ? sessions : [];
    const today = new Date();
    const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const dayMs = 24 * 60 * 60 * 1000;
    const groups = [
      { key: "Today", items: [] },
      { key: "Yesterday", items: [] },
      { key: "Earlier", items: [] },
    ];

    for (const session of items) {
      const createdAt = session?.createdAt ? new Date(session.createdAt) : null;
      const deltaDays = createdAt ? Math.floor((startOfDay(today) - startOfDay(createdAt)) / dayMs) : 999;
      if (deltaDays <= 0) groups[0].items.push(session);
      else if (deltaDays === 1) groups[1].items.push(session);
      else groups[2].items.push(session);
    }

    return groups.filter((group) => group.items.length > 0);
  }, [sessions]);

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
          "relative group flex items-center justify-between rounded-2xl px-3 py-2.5 mb-2 transition-all duration-200 border",
          isActive
            ? "bg-blue-50 text-blue-700 border-blue-200 shadow-sm"
            : "bg-white/90 hover:bg-blue-50 text-slate-700 border-slate-200/80 hover:border-blue-200"
        )}
      >
        {/* Active indicator line */}
        {isActive && (
          <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r-full bg-blue-600" />
        )}

        <div className="mr-2 flex h-8 w-8 items-center justify-center rounded-xl bg-slate-100 text-slate-500">
          <FiMessageSquare className="h-4 w-4" />
        </div>

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
            className="ml-2 flex-1 text-xs px-3 py-2 rounded-xl border border-blue-300 outline-none focus:border-blue-500 bg-white"
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
              "w-full flex-1 text-left text-sm truncate px-1 py-1 font-medium",
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
              "p-2 rounded-xl transition-all duration-150 flex-shrink-0",
              isMenuOpen
                ? "opacity-100 bg-slate-200 text-slate-700"
                : "opacity-75 group-hover:opacity-100 text-slate-500 hover:bg-slate-100"
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
            className="fixed w-44 bg-white border border-slate-200 rounded-2xl shadow-[0_20px_50px_rgba(15,23,42,0.14)] z-[999999] overflow-hidden"
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
              className="w-full flex items-center gap-3 text-left px-4 py-3 text-xs text-slate-700 hover:bg-slate-50 transition-colors"
              type="button"
              aria-label="Start renaming chat"
              tabIndex={0}
            >
              <FiEdit3 className="h-4 w-4 text-slate-500" />
              <span>Rename</span>
            </button>

            {/* SPLIT LINE */}
            <div className="border-t border-slate-200" />

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
          className="mx-2 mt-2 flex items-center gap-2 rounded-xl px-3 py-2 text-slate-800 hover:bg-blue-50 hover:text-blue-700 transition-all duration-150 active:scale-[0.98] flex-shrink-0"
          aria-label="Start a new chat"
        >
          <FiPlus className="h-6 w-5" />
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
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                {sessionsLoading ? "Loading..." : "No chats yet"}
              </div>
            ) : (
                  groupedSessions.map((group) => (
                    <div key={group.key} className="mb-3">
                      <div className="mb-2 flex items-center gap-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                        <FiClock className="h-3.5 w-3.5" />
                        <span>{group.key}</span>
                      </div>
                      <div className="space-y-1">{group.items.map(renderChatItem)}</div>
                    </div>
                  ))
            )}

            {sessionsLoading && sessions.length > 0 && (
                  <div className="text-[11px] text-slate-400 px-3 py-2">
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
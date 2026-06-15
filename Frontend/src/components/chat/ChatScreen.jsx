import MessageBubble from "../MessageBubble";
import toast from "react-hot-toast";
import { createPortal } from "react-dom";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  FiCopy,
  FiCheck,
  FiEdit2,
  FiDownload,
  FiRefreshCw,
  FiChevronDown,
} from "react-icons/fi";

function normalizeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "1", "connected", "online", "active"].includes(v)) return true;
    if (["false", "no", "0", "disconnected", "offline", "inactive"].includes(v)) return false;
  }
  return fallback;
}

function isTileConnected(tile) {
  if (!tile || typeof tile !== "object") return false;

  if (tile.connected === true) return true;
  if (tile.isConnected === true) return true;

  const status = String(tile.status || "").trim().toLowerCase();
  if (["connected", "online", "active"].includes(status)) return true;
  if (["disconnected", "offline", "inactive"].includes(status)) return false;

  return normalizeBool(tile.connected, false) || normalizeBool(tile.isConnected, false);
}

export default function ChatScreen({
  isConnected,
  userName,

  normalizeSystemId,

  tiles = [],
  onAddNewSystem,
  onReconnectSystem,

  messagesElRef,
  onMessagesScrollInternal,
  activeConv,
  msgLoadingMore,
  editingIndex,
  editingText,
  setEditingText,
  startEditMessage,
  cancelEdit,
  applyEditLocal,
  onSend,
  pendingAction,
  onCopyAssistant,
  onDownloadAssistant,
  onToast,

  loading,
  bottomRef,
  showScrollDown,
  statusText,
  inlineForm,
}) {
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState(null);
  const [downloadMenuIndex, setDownloadMenuIndex] = useState(null);
  const [downloadMenuStyle, setDownloadMenuStyle] = useState(null);
  const downloadButtonRefs = useRef(new Map());

  const safeOnSend = typeof onSend === "function" ? onSend : null;
  const safeOnCopyAssistant = typeof onCopyAssistant === "function" ? onCopyAssistant : null;
  const safeOnDownloadAssistant = typeof onDownloadAssistant === "function" ? onDownloadAssistant : null;
  const safeOnToast = typeof onToast === "function" ? onToast : null;
  const safeStartEditMessage = typeof startEditMessage === "function" ? startEditMessage : null;
  const safeCancelEdit = typeof cancelEdit === "function" ? cancelEdit : null;
  const safeApplyEditLocal = typeof applyEditLocal === "function" ? applyEditLocal : null;
  const safeSetEditingText = typeof setEditingText === "function" ? setEditingText : null;

  useEffect(() => {
    if (downloadMenuIndex === null) {
      setDownloadMenuStyle(null);
      return;
    }

    const updateMenuPosition = () => {
      const trigger = downloadButtonRefs.current.get(downloadMenuIndex);
      if (!trigger) {
        setDownloadMenuStyle(null);
        return;
      }

      const rect = trigger.getBoundingClientRect();
      const menuWidth = 256;
      const menuHeight = 118;
      const gap = 10;
      const padding = 12;

      let left = rect.right - menuWidth;
      if (left < padding) left = padding;
      if (left + menuWidth > window.innerWidth - padding) {
        left = Math.max(padding, window.innerWidth - padding - menuWidth);
      }

      let top = rect.top - menuHeight - gap;
      if (top < padding) {
        top = rect.bottom + gap;
      }

      const maxTop = window.innerHeight - padding - menuHeight;
      if (top > maxTop) top = Math.max(padding, maxTop);

      setDownloadMenuStyle({
        position: "fixed",
        top: `${top}px`,
        left: `${left}px`,
        width: `${menuWidth}px`,
        zIndex: 9999,
      });
    };

    updateMenuPosition();
    window.addEventListener("resize", updateMenuPosition);
    window.addEventListener("scroll", updateMenuPosition, true);

    return () => {
      window.removeEventListener("resize", updateMenuPosition);
      window.removeEventListener("scroll", updateMenuPosition, true);
    };
  }, [downloadMenuIndex]);

  useEffect(() => {
    if (downloadMenuIndex === null) return;

    const handlePointerDown = (event) => {
      const trigger = downloadButtonRefs.current.get(downloadMenuIndex);
      const clickedTrigger = Boolean(trigger && trigger.contains(event.target));
      const clickedMenu = Boolean(event.target?.closest?.('[data-download-menu="true"]'));

      if (!clickedTrigger && !clickedMenu) {
        setDownloadMenuIndex(null);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, [downloadMenuIndex]);

  const tileList = Array.isArray(tiles) ? tiles : [];

  const connectionMeta = useMemo(() => {
    const totalSystems = tileList.length;
    const connectedSystems = tileList.filter(isTileConnected);
    const connectedCount = connectedSystems.length;

    if (totalSystems === 0) {
      return {
        state: "no_systems",
        message: "No SAP system has been added yet. Connect a system from the header to continue.",
      };
    }

    if (connectedCount === 0) {
      return {
        state: "all_disconnected",
        message: "All SAP systems are disconnected. Connect a system from the header to continue.",
      };
    }

    return {
      state: "available_but_not_connected",
      message: "An SAP system is available, but this chat session is not connected yet. Connect a system from the header to continue.",
    };
  }, [tileList]);

  const handleCopyText = async (text, idx) => {
    if (!text) return;

    try {
      await navigator.clipboard.writeText(text);
      toast.success("Copied!");
      setCopiedIndex(idx);

      setTimeout(() => {
        setCopiedIndex(null);
      }, 1500);
    } catch {
      toast.error("Copy failed.");
    }
  };

  const handleRegenerateMessage = (idx) => {
    if (!isConnected) return;
    if (!safeOnCopyAssistant) return;

    setRegeneratingIndex(idx);
    safeOnCopyAssistant(idx);

    setTimeout(() => {
      setRegeneratingIndex(null);
    }, 1500);
  };

  const handleDownloadChoice = (group, mode) => {
    setDownloadMenuIndex(null);
    if (!safeOnDownloadAssistant) {
      safeOnToast?.({
        type: "error",
        title: "Download unavailable",
        message: "Download is not available right now.",
      });
      return;
    }

    safeOnToast?.({
      type: "info",
      title: "Preparing download",
      message: mode === "current" ? "Building current section PDF..." : "Fetching entire dataset for PDF...",
      duration: 1200,
    });

    safeOnDownloadAssistant({ group, mode });
  };

  const handleSuggestion = (value) => {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      if (value?.action?.type === "add_system") {
        onAddNewSystem?.();
        return;
      }

      if (value?.action?.type === "reconnect_system") {
        const sid = String(value?.action?.systemId || "").trim().toUpperCase();
        if (sid) {
          onReconnectSystem?.(sid, value);
          return;
        }

        onAddNewSystem?.();
        return;
      }

      if (!safeOnSend || !isConnected) return;
      safeOnSend(value);
      return;
    }

    if (!safeOnSend || !isConnected) return;

    const text = String(value || "").trim();
    if (!text) return;

    if (text === "Add System") {
      onAddNewSystem?.();
      return;
    }

    const upper = text.toUpperCase();

    if (pendingAction && (upper === "ROW" || upper === "INDIA")) {
      safeOnSend({
        overrideText: upper,
        displayText: upper,
        businessScope: upper,
        pendingContext: pendingAction,
      });
      return;
    }

    // Important:
    // Do NOT convert suggestion text like "Use S4D" into forcedSystemId.
    // That can keep stale disconnected systems alive after reconnect.
    safeOnSend({
      overrideText: text,
      displayText: text,
    });
  };

  const groupedMessages = [];
  const messages = Array.isArray(activeConv?.messages) ? activeConv.messages : [];

  for (let i = 0; i < messages.length; i++) {
    const current = messages[i];

    if (current?.role === "assistant") {
      const grouped = [current];

      while (i + 1 < messages.length && messages[i + 1]?.role === "assistant") {
        grouped.push(messages[i + 1]);
        i++;
      }

      groupedMessages.push({
        role: "assistant-group",
        messages: grouped,
      });
    } else {
      groupedMessages.push(current);
    }
  }

  return (
    <>
      {isConnected ? (
        <section
          ref={messagesElRef}
          className="flex-1 overflow-y-auto overflow-x-hidden px-4 py-6 pt-4 pb-36 overscroll-contain"
          onScroll={onMessagesScrollInternal}
        >
          <div className="mx-auto max-w-4xl space-y-4">
            {msgLoadingMore && activeConv?.messages?.length > 0 && (
              <div className="px-4 py-2 text-xs text-gray-400 italic">
                Loading more…
              </div>
            )}

            {groupedMessages.map((m, idx) => {
              const isUser = m?.role === "user";
              const isAssistantGroup = m?.role === "assistant-group";
              const isEditing = editingIndex === idx;

              return (
                <div key={idx} className="group">
                  {isUser && !isEditing && (
                    <div className="flex flex-col items-end">
                      <MessageBubble role={m.role} text={m.text} summary={m.summary} />

                      <div className="mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                        <button
                          type="button"
                          onClick={() => handleCopyText(m.text, idx)}
                          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                          title="Copy"
                        >
                          {copiedIndex === idx ? (
                            <FiCheck size={15} className="text-green-600" />
                          ) : (
                            <FiCopy size={15} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => safeStartEditMessage?.(idx)}
                          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                          title="Edit"
                        >
                          <FiEdit2 size={15} />
                        </button>
                      </div>
                    </div>
                  )}

                  {isUser && isEditing && (
                    <div className="rounded-2xl bg-gray-100 p-3">
                      <div className="mb-2 text-xs text-blue-600">
                        Editing message to save & resend, or else click cancel.
                      </div>

                      <textarea
                        value={editingText}
                        onChange={(e) => safeSetEditingText?.(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-zinc-800 bg-white px-3 py-2 text-sm text-black outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                      />

                      <div className="mt-2 flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={() => safeCancelEdit?.()}
                          className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-white bg-black"
                        >
                          Cancel
                        </button>

                        <button
                          type="button"
                          onClick={() => {
                            if (!safeApplyEditLocal || !safeOnSend) return;

                            const newText = safeApplyEditLocal({
                              removeFollowingAssistant: true,
                            });

                            if (newText) {
                              safeOnSend({
                                overrideText: newText,
                                displayText: newText,
                                fromEdit: true,
                              });
                            }
                          }}
                          className="rounded-xl px-3 py-2 text-sm font-semibold text-white bg-green-600"
                          disabled={!isConnected}
                        >
                          Save & resend
                        </button>
                      </div>
                    </div>
                  )}

                  {isAssistantGroup && (
                    <div className="relative">
                      <div className="space-y-3">
                        {m.messages.map((msg, subIdx) => (
                          <div key={subIdx}>
                            <MessageBubble
                              role={msg?.role}
                              text={msg?.text}
                              summary={msg?.summary}
                              data={msg?.data}
                              chart={msg?.chart}
                              suggestions={msg?.suggestions}
                              showAvatar={subIdx === 0}
                              onSuggestionClick={(value) => {
                                handleSuggestion(value);
                              }}
                            />
                          </div>
                        ))}
                      </div>

                      <div className="relative z-[9999] mt-2 flex items-center gap-2 ml-12">
                        <button
                          type="button"
                          onClick={() => {
                            const fullText = m.messages.map((msg) => msg?.text || "").join("\n\n");
                            handleCopyText(fullText, idx);
                          }}
                          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                          title="Copy"
                        >
                          {copiedIndex === idx ? (
                            <FiCheck size={15} className="text-green-600" />
                          ) : (
                            <FiCopy size={15} />
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleRegenerateMessage(idx)}
                          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                          title="Regenerate"
                          disabled={regeneratingIndex === idx || !isConnected}
                        >
                          <FiRefreshCw
                            size={15}
                            className={regeneratingIndex === idx ? "animate-spin" : ""}
                          />
                        </button>

                        <div className="relative z-[9999]">
                          <button
                            type="button"
                            onClick={() =>
                              setDownloadMenuIndex(downloadMenuIndex === idx ? null : idx)
                            }
                            ref={(node) => {
                              if (node) {
                                downloadButtonRefs.current.set(idx, node);
                              } else {
                                downloadButtonRefs.current.delete(idx);
                              }
                            }}
                            className="relative z-[9999] flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                            title="Download"
                          >
                            <FiDownload size={15} />
                          </button>
                        </div>

                        {downloadMenuIndex === idx &&
                          downloadMenuStyle &&
                          typeof document !== "undefined" &&
                          createPortal(
                            <div
                              data-download-menu="true"
                              className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_20px_50px_rgba(0,0,0,0.15)]"
                              style={downloadMenuStyle}
                            >
                              <div className="px-4 py-3 border-b border-gray-100">
                                <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
                                  Download Options
                                </p>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDownloadChoice(m, "current")}
                                className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                Download current section
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDownloadChoice(m, "entire")}
                                className="flex w-full items-center gap-3 border-t border-gray-100 px-4 py-3 text-left text-sm text-gray-700 hover:bg-gray-50 transition-colors"
                              >
                                Download entire data
                              </button>
                            </div>,
                            document.body
                          )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}

            {inlineForm && <div className="mx-auto max-w-4xl">{inlineForm}</div>}

            {loading && (
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-white shrink-0 border border-gray-200 shadow-sm">
                  <video
                    src="/bot.mp4"
                    autoPlay
                    muted
                    loop
                    playsInline
                    className="h-full w-full object-cover"
                  />
                </div>

                <div className="text-sm text-gray-500 italic animate-pulse">
                  {statusText || "Preparing results..."}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </section>
      ) : (
        <section className="flex-1 flex items-center justify-center px-4 py-4 overflow-hidden">
          <div className="mx-auto max-w-2xl w-full">
            <div className="bg-gradient-to-br from-green-50 to-indigo-50 rounded-2xl border border-green-600 p-6 text-center shadow-lg">
              <h2 className="text-xl sm:text-2xl font-bold text-green-800 mb-1">
                Welcome, {userName}!
              </h2>

              <p className="text-xs sm:text-sm text-black-600 mb-5">
                {connectionMeta.message}
              </p>
            </div>
          </div>
        </section>
      )}

      {showScrollDown && isConnected && (
        <button
          type="button"
          onClick={() =>
            bottomRef?.current?.scrollIntoView({
              behavior: "smooth",
            })
          }
          className="fixed bottom-20 right-6 z-20 w-10 h-10 flex items-center justify-center rounded-full bg-white border shadow-lg hover:bg-gray-50 transition"
        >
          <FiChevronDown size={18} />
        </button>
      )}
    </>
  );
}
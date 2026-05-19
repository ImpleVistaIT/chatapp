import MessageBubble from "../MessageBubble";
import TypingText from "../TypingText";
import toast from "react-hot-toast";
import { useState } from "react";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

export default function ChatScreen({
  isConnected,
  userName,
  systemList = [],
  normalizeSystemId,
  handleSystemSelect,
  tiles = [],
  onAddNewSystem,
  showSystemDropdown,
  setShowSystemDropdown,
  connectingSystemId,
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
  onCopyAssistant,
  copiedAtIndex,
  loading,
  bottomRef,
  showScrollDown,
  statusText,
}) {
  const tileList = Array.isArray(tiles) ? tiles : [];
  const [copiedIndex, setCopiedIndex] = useState(null);
  const [regeneratingIndex, setRegeneratingIndex] = useState(null);

  // ✅ COPY FUNCTION (clean + toast)
  const handleCopyText = (text, idx) => {
    if (!text) return;

    navigator.clipboard.writeText(text);
    toast.success("Copied!");

    setCopiedIndex(idx);

    setTimeout(() => {
      setCopiedIndex(null);
    }, 1500);
  };

  // ✅ REGENERATE FUNCTION
  const handleRegenerateMessage = (idx) => {
    if (!isConnected) return;

    setRegeneratingIndex(idx);
    
    // Call the regenerate/reload function - you may need to pass this as a prop
    if (typeof onCopyAssistant === "function") {
      onCopyAssistant(idx);
    }

    setTimeout(() => {
      setRegeneratingIndex(null);
    }, 1500);
  };

  const showConnectButton = tileList.length > 0;

  const disconnectedText = showConnectButton
    ? "You're disconnected from SAP. Connect to start chatting."
    : "No SAP system configured yet. Please add a system to start chatting.";

  return (
    <>
      {isConnected ? (
        <section
          ref={messagesElRef}
          className="flex-1 overflow-y-auto px-4 py-6 pt-4 pb-28 overscroll-contain"
          onScroll={onMessagesScrollInternal}
        >
          <div className="mx-auto max-w-4xl space-y-4">
            {msgLoadingMore && activeConv?.messages?.length > 0 && (
              <div className="px-4 py-2 text-xs text-gray-400 italic">
                Loading more…
              </div>
            )}

            {(activeConv?.messages || []).map((m, idx) => {
              const isUser = m.role === "user";
              const isAssistant = m.role === "assistant";
              const isEditing = editingIndex === idx;

              return (
                <div key={idx} className="group">
                  {/* USER MESSAGE */}
                  {isUser && !isEditing && (
                    <div className="flex flex-col items-end">
                      <MessageBubble role={m.role} text={m.text} />

                      {/* USER ACTIONS */}
                      <div className="mt-1 flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity pr-2">
                        {/* COPY */}
                        <button
                          onClick={() => handleCopyText(m.text, idx)}
                          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                          title="Copy"
                        >
                          {copiedIndex === idx ? "✓" : "⧉"}
                        </button>

                        {/* EDIT */}
                        <button
                          onClick={() => startEditMessage(idx)}
                          className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                          title="Edit"
                        >
                          ✎
                        </button>
                      </div>
                    </div>
                  )}

                  {/* EDIT MODE */}
                  {isUser && isEditing && (
                    <div className="rounded-2xl bg-gray-100 p-3">
                      <div className="mb-2 text-xs text-blue-600">
                        Editing message to save & resend, or else click cancel.
                      </div>

                      <textarea
                        value={editingText}
                        onChange={(e) => setEditingText(e.target.value)}
                        rows={3}
                        className="w-full resize-none rounded-xl border border-zinc-800 bg-white px-3 py-2 text-sm text-black outline-none focus:border-amber-400 focus:ring-2 focus:ring-amber-400/20"
                      />

                      <div className="mt-2 flex gap-2 justify-end">
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-xl border border-zinc-800 px-3 py-2 text-sm text-white bg-black"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            const newText = applyEditLocal({
                              removeFollowingAssistant: true,
                            });
                            if (newText)
                              onSend({
                                overrideText: newText,
                                fromEdit: true,
                              });
                          }}
                          className="rounded-xl px-3 py-2 text-sm font-semibold text-white bg-green-600"
                          disabled={!isConnected}
                        >
                          Save & resend
                        </button>
                      </div>
                    </div>
                  )}

                  {/* ASSISTANT MESSAGE */}
                  {isAssistant && (
                    <div className="relative">
                      {/* SUMMARY */}
                      {typeof m.summary === "string" &&
                        m.summary.trim() !== "" && (
                          <div
                            style={{
                              marginBottom: "6px",
                              fontWeight: "500",
                              color: "#444",
                            }}
                          >
                            {idx === activeConv.messages.length - 1 ? (
                              <TypingText text={m.summary} speed={15} />
                            ) : (
                              m.summary
                            )}
                          </div>
                        )}

                      {/* MAIN MESSAGE */}
                      <div className="relative">
                        <MessageBubble
                          role={m.role}
                          text={m.text}
                          onSuggestionClick={(text) => {
                            if (!isConnected) return;
                            onSend({ overrideText: text });
                          }}
                        />

                        {/* ✅ SUGGESTIONS BELOW MESSAGE */}
                        {m.role === "assistant" &&
                          m.suggestions?.length > 0 && (
                            <div className="ml-12 mt-2 flex flex-wrap gap-2">
                              {m.suggestions.map((s, i) => (
                                <button
                                  key={i}
                                  onClick={() => onSend({ overrideText: s })}
                                  className="px-5 py-1.5 text-xs bg-white text-black border border-dashed border-green-700 rounded-full transition "
                                >
                                  {s}
                                </button>
                              ))}
                            </div>
                          )}
                      </div>

                      {/* ✅ COPY & RELOAD BUTTONS (ALWAYS VISIBLE) */}
                      {m.text && (
                        <div className="mt-2 flex items-center gap-2 ml-12">
                          {/* COPY BUTTON */}
                          <button
                            onClick={() => handleCopyText(m.text, idx)}
                            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                            title="Copy"
                          >
                            {copiedIndex === idx ? "✓" : "⧉"}
                          </button>

                          {/* RELOAD/REGENERATE BUTTON */}
                          <button
                            onClick={() => handleRegenerateMessage(idx)}
                            className="flex items-center justify-center w-7 h-7 rounded-md hover:bg-gray-200 text-gray-500 hover:text-black transition"
                            title="Regenerate"
                            disabled={regeneratingIndex === idx || !isConnected}
                          >
                            {regeneratingIndex === idx ? (
                              <span className="animate-spin">⟳</span>
                            ) : (
                              "⟳"
                            )}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}

            {/* LOADING */}
            {loading && (
              <div className="flex items-center gap-3 px-2 py-2">
                <div className="h-10 w-10 rounded-full overflow-hidden bg-white shrink-0">
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
              <p className="text-xs sm:text-sm text-gray-600 mb-5">
                {disconnectedText}
              </p>

              <div className="flex items-center justify-center gap-2 flex-wrap">
                {showConnectButton && (
                  <button
                    onClick={() =>
                      setShowSystemDropdown(!showSystemDropdown)
                    }
                    className="inline-flex items-center gap-2 bg-emerald-600 text-white font-semibold px-5 py-2.5 rounded-xl hover:bg-emerald-700 transition-all duration-200"
                    type="button"
                  >
                    {connectingSystemId ? "Connecting..." : "Connect to System"}
                  </button>
                )}

                {typeof onAddNewSystem === "function" && (
                  <button
                    onClick={() => onAddNewSystem()}
                    className="inline-flex items-center gap-2 bg-green-400 px-5 py-2.5 rounded-xl border"
                    type="button"
                  >
                    Add System
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* SCROLL BUTTON */}
      {showScrollDown && isConnected && (
        <button
          onClick={() =>
            bottomRef.current?.scrollIntoView({ behavior: "smooth" })
          }
          className="fixed bottom-20 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white border shadow-lg"
        >
          ↓
        </button>
      )}
    </>
  );
}
import MessageBubble from "./MessageBubble";
import menuIcon from "../assets/hamberger.png";
import { FiMic, FiMicOff, FiSend, FiSquare, FiEdit2, FiCopy, FiCheck } from "react-icons/fi";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

function formatTime(d = new Date()) {
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function ChatWindow({
  // state
  loading,
  input,
  listening,
  supported,
  showScrollDown,
  activeConv,
  editingIndex,
  editingText,
  copiedAtIndex,

  // refs
  bottomRef,
  inputRef,

  // handlers/setters
  setSidebarOpen,
  setInput,
  onSend,
  onStop,
  onKeyDown,
  onMicClick,
  onCopyAssistant,
  startEditMessage,
  cancelEdit,
  applyEditLocal,
  setEditingText,

  // ✅ NEW: passed from Chat.jsx (keeps logic in Chat.jsx)
  onMessagesScroll,
}) {
  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-white">
      {/* HEADER */}
      <header className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setSidebarOpen((v) => !v)}
            className="p-2 rounded-lg hover:bg-gray-200 md:hidden"
          >
            <img src={menuIcon} className="w-6 h-6" />
          </button>

          <div>
            <div className="text-sm font-semibold">SAP Assistant</div>
            <div className="text-xs text-zinc-500">
              {loading ? "Thinking…" : "Online"} • {formatTime()}
            </div>
          </div>
        </div>

        <span
          className={classNames(
            "inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold",
            loading ? "bg-amber-500/15 text-amber-300" : "bg-emerald-500/15 text-emerald-300"
          )}
        >
          {loading ? "Busy" : "Ready"}
        </span>
      </header>

      {/* MESSAGES */}
      <section
        className="flex-1 overflow-y-auto px-4 py-6 pt-4 pb-28 overscroll-contain"
        onScroll={onMessagesScroll}  // ✅ FIX: use Chat.jsx logic
      >
        <div className="mx-auto max-w-4xl space-y-4">
          {activeConv?.messages?.map((m, idx) => {
            const isUser = m.role === "user";
            const isAssistant = m.role === "assistant";
            const isEditing = editingIndex === idx;

            return (
              <div key={idx} className="group">
                {/* User message */}
                {isUser && !isEditing && (
                  <div className="relative">
                    <MessageBubble role={m.role} text={m.text} />
                    <button
                      type="button"
                      onClick={() => startEditMessage(idx)}
                      className="absolute -top-2 right-0 hidden group-hover:flex items-center gap-2 rounded-xl bg-gray-100 px-3 py-1 text-xs text-black"
                      title="Edit message"
                    >
                      <FiEdit2 />
                      <span className="hidden sm:inline">Edit</span>
                    </button>
                  </div>
                )}

                {/* Edit mode */}
                {isUser && isEditing && (
                  <div className="rounded-2xl bg-gray-100 p-3">
                    <div className="mb-2 text-xs text-blue-600">
                      Editing message to save & resend,or else click cancel.
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
                          const newText = applyEditLocal({ removeFollowingAssistant: true });
                          if (newText) onSend({ overrideText: newText, fromEdit: true });
                        }}
                        className="rounded-xl px-3 py-2 text-sm font-semibold text-white bg-green-600"
                      >
                        Save & resend
                      </button>
                    </div>
                  </div>
                )}

                {/* Assistant message */}
                {isAssistant && (
                  <div className="relative">
                    <MessageBubble
                      role={m.role}
                      text={m.text}
                      suggestions={m.suggestions}
                      onSuggestionClick={(text) => onSend({ overrideText: text })}
                    />
                    <button
                      type="button"
                      onClick={() => onCopyAssistant(idx, m.text)}
                      className={`absolute -top-6 left-10 hidden group-hover:flex items-center gap-2 rounded-xl px-3 py-1 text-xs font-medium transition ${
                        copiedAtIndex === idx
                          ? "bg-gray-300 text-zinc-800"
                          : "bg-gray-100 text-zinc-700 hover:bg-gray-200"
                      }`}
                      title="Copy response"
                    >
                      {copiedAtIndex === idx ? <FiCheck /> : <FiCopy />}
                      <span className="hidden sm:inline">{copiedAtIndex === idx ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {loading && <MessageBubble role="assistant" text="Executing..." />}
          <div ref={bottomRef} />
        </div>
      </section>

      {showScrollDown && (
        <button
          onClick={() => bottomRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="fixed bottom-20 right-6 w-10 h-10 flex items-center justify-center rounded-full bg-white/90 backdrop-blur border border-gray-300 shadow-lg hover:bg-white hover:scale-105 transition-all duration-200 z-50"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-gray-700" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* COMPOSER */}
      <footer className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-200">
        <div className="mx-auto max-w-4xl">
          <div className="rounded-2xl border border-gray-300 bg-gray-100 p-3">
            <div className="flex items-end gap-2">
              <button
                type="button"
                onClick={onMicClick}
                className={classNames(
                  "rounded-xl px-3 py-2 border transition flex items-center justify-center",
                  listening
                    ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-700"
                    : "bg-white text-zinc-700 border-gray-300 hover:bg-gray-200"
                )}
                title={listening ? "Stop voice input" : "Start voice input"}
              >
                {listening ? <FiMicOff className="text-lg" /> : <FiMic className="text-lg" />}
              </button>

              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={onKeyDown}
                rows={2}
                placeholder="Type or speak…"
                className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
              />

              {loading ? (
                <button
                  type="button"
                  onClick={onStop}
                  className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 flex items-center gap-2"
                  title="Stop generating"
                >
                  <FiSquare className="text-lg" />
                  <span className="hidden sm:inline">Stop</span>
                </button>
              ) : (
                <button
                  onClick={() => onSend()}
                  disabled={!input.trim()}
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center gap-2"
                  title="Send"
                >
                  <FiSend className="text-lg" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              )}
            </div>

            {!supported && (
              <div className="mt-2 px-1 text-xs text-amber-300">
                Voice input not supported in this browser. Try Chrome / Edge.
              </div>
            )}
          </div>
        </div>
      </footer>
    </main>
  );
}
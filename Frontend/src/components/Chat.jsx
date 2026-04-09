import { useEffect, useMemo, useRef, useState } from "react";
import { sendChatMessage } from "../api/chatApi";
import MessageBubble from "./MessageBubble";
import { useSpeechToText } from "../hooks/useSpeechToText";
import logoFull from "../assets/ImplevistaLogo.png";
import logoSmall from "../assets/Vlogo.png";
import chat from "../assets/new-chat.png";
import sidebaropen from "../assets/sidebar.png";
import sidebarclose from "../assets/sidebar-close.png";
import newChatIcon from "../assets/new-chat.png"; // collapsed icon
import searchIcon from "../assets/search.png";
import userImg from "../assets/user.png";
import menuIcon from "../assets/hamberger.png";
import close from "../assets/close.png";
import { FiArrowDown } from "react-icons/fi";

import {
FiMic,
FiMicOff,
FiSend,
FiPlus,
FiMenu,
FiX,
FiEdit2,
FiCopy,
FiSquare,
FiCheck,
} from "react-icons/fi";

function classNames(...x) {
return x.filter(Boolean).join(" ");
}

function formatTime(d = new Date()) {
return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

async function copyToClipboard(text) {
const t = String(text ?? "");
if (!t) return false;

try {
await navigator.clipboard.writeText(t);
return true;
} catch {
try {
  const ta = document.createElement("textarea");
  ta.value = t;
  document.body.appendChild(ta);
  ta.select();
  document.execCommand("copy");
  document.body.removeChild(ta);
  return true;
} catch {
  return false;
}
}
}
function generateTitle(text) {
if (!text) return "New chat";

let clean = text.trim();
const words = clean.split(" ").slice(0, 6).join(" ");

return words.charAt(0).toUpperCase() + words.slice(1);
}

export default function Chat() {
const [conversations, setConversations] = useState([
{
  id: "default",
  title: "SAP MM Chat",
  messages: [
    {
      role: "assistant",
      text: "Hi, Welcome to ImpleVista AI. How may I assist you?",
      suggestions: [
        "Show latest purchase orders",
        "Show PO created in January 2026",
        "Show details of PO 4500001933",
      ],
    },
  ], updatedAt: Date.now(),
},
]);
const [activeId, setActiveId] = useState("default");
const [input, setInput] = useState("");
const [loading, setLoading] = useState(false);
const [showScrollDown, setShowScrollDown] = useState(false);
const [editingChatId, setEditingChatId] = useState(null);
const [editingTitle, setEditingTitle] = useState("");

// ✅ Mobile sidebar toggle
const [sidebarOpen, setSidebarOpen] = useState(false);

// Sidebar Closing
const [collapsed, setCollapsed] = useState(false);
const [menuOpenId, setMenuOpenId] = useState(null);

// ✅ Inline edit for a user message (ChatGPT-style)
const [editingIndex, setEditingIndex] = useState(null);
const [editingText, setEditingText] = useState("");

// ✅ Copy feedback
const [copiedAtIndex, setCopiedAtIndex] = useState(null);

// ✅ Stop generating (AbortController)
const abortRef = useRef(null);

const bottomRef = useRef(null);
const inputRef = useRef(null);

// Voice state
const baseRef = useRef("");
const interimRef = useRef("");

const activeConv = useMemo(
() => conversations.find((c) => c.id === activeId),
[conversations, activeId]
);

useEffect(() => {
if (window.innerWidth > 768) {
  inputRef.current?.focus();
}
}, [activeId]);

useEffect(() => {
const scrollToBottom = () => {
  const el = bottomRef.current;
  if (!el) return;

  const container = el.closest("section");
  if (!container) return;

  container.scrollTo({
    top: container.scrollHeight,
    behavior: "auto",
  });
};

const t1 = setTimeout(scrollToBottom, 150);
const t2 = setTimeout(scrollToBottom, 400);

return () => {
  clearTimeout(t1);
  clearTimeout(t2);
};
}, [activeConv?.messages?.length, loading]);

useEffect(() => {
setSidebarOpen(false);
}, [activeId]);

function focusInput() {
setTimeout(() => inputRef.current?.focus(), 0);
}

function updateActiveMessages(updater) {
setConversations((prev) =>
  prev.map((c) => {
    if (c.id !== activeId) return c;
    const messages = typeof updater === "function" ? updater(c.messages) : updater;
    return { ...c, messages, updatedAt: Date.now() };
  })
);
}

function handleRename(id) {
const newName = prompt("Enter new chat name:");
if (!newName) return;

setConversations((prev) =>
  prev.map((c) =>
    c.id === id ? { ...c, title: newName } : c
  )
);

setMenuOpenId(null);
}
function handleDelete(id) {
setConversations((prev) => prev.filter((c) => c.id !== id));

if (id === activeId && conversations.length > 1) {
  const next = conversations.find((c) => c.id !== id);
  if (next) setActiveId(next.id);
}

setMenuOpenId(null);
}
function saveRename(id) {
if (!editingTitle.trim()) return cancelRename();

setConversations((prev) =>
  prev.map((c) =>
    c.id === id ? { ...c, title: editingTitle } : c
  )
);

setEditingChatId(null);
setEditingTitle("");
}
function cancelRename() {
setEditingChatId(null);
setEditingTitle("");
}

function onNewChat() {
const id = `c_${Date.now()}`;

setConversations((prev) => [
  {
    id,
    title: "New chat",
    messages: [
      {
        role: "assistant",
        text: "Hi, Welcome to ImpleVista AI. How may I assist you?",
        suggestions: [
          "Show latest purchase orders",
          "Show PO created in January 2026",
          "Show details of PO 4500001933",
        ],
      },
    ],
    updatedAt: Date.now(),
  },
  ...prev,
]);

setActiveId(id);
setInput("");
baseRef.current = "";
interimRef.current = "";
setEditingIndex(null);
setEditingText("");
focusInput();
}
function startEditMessage(idx) {
const m = activeConv?.messages?.[idx];
if (!m || m.role !== "user") return;

setEditingIndex(idx);
setEditingText(m.text || "");
}

function cancelEdit() {
setEditingIndex(null);
setEditingText("");
focusInput();
}

// Replace the edited user message and (optionally) remove assistant messages after it.
function applyEditLocal({ removeFollowingAssistant = true } = {}) {
const newText = editingText.trim();
if (editingIndex == null || !newText) return null;

updateActiveMessages((msgs) => {
  const copy = [...msgs];
  copy[editingIndex] = { ...copy[editingIndex], text: newText };

  if (removeFollowingAssistant) {
    // remove everything after edited message (like ChatGPT re-run behavior)
    return copy.slice(0, editingIndex + 1);
  }

  return copy;
});

setEditingIndex(null);
setEditingText("");
return newText;
}

async function onSend({ overrideText, fromEdit = false } = {}) {
const text = String(overrideText ?? input).trim();
if (!text || loading) return;

baseRef.current = "";
interimRef.current = "";

if (!fromEdit) {
  updateActiveMessages((m) => [...m, { role: "user", text }]);

  // ✅ AUTO TITLE UPDATE
  setConversations((prev) =>
    prev.map((c) => {
      if (c.id !== activeId) return c;

      // only update if default title
      if (c.title === "New chat" || c.title === "SAP MM Chat") {
        return {
          ...c,
          title: generateTitle(text),
        };
      }

      return c;
    })
  );
}
setInput("");
setTimeout(() => {
  inputRef.current?.blur();
}, 50);
setLoading(true);

const controller = new AbortController();
abortRef.current = controller;
try {
  // send conversationId so backend can store context per conversation
  const data = await sendChatMessage(text, {
    signal: controller.signal,
    conversationId: activeId,
  });

  updateActiveMessages((m) => [
    ...m,
    {
      role: "assistant",
      text: data.reply ?? "",
      suggestions: data.suggestions, // ✅ correct
    },
  ]);

} catch (e) {
  if (e?.name === "AbortError") {
    updateActiveMessages((m) => [
      ...m,
      { role: "assistant", text: "Stopped generating." },
    ]);
  } else {
    updateActiveMessages((m) => [
      ...m,
      { role: "assistant", text: `Error: ${e.message}` },
    ]);
  }

} finally {
  setLoading(false);
  abortRef.current = null;
}
}
function onStop() {
if (abortRef.current) abortRef.current.abort();
}


function onKeyDown(e) {
if (e.key === "Enter" && !e.shiftKey) {
  e.preventDefault();

  if (editingIndex != null) {
    // Apply edit and re-run
    const newText = applyEditLocal({ removeFollowingAssistant: true });
    if (newText) onSend({ overrideText: newText, fromEdit: true });
  } else {
    onSend();
  }
}

if (e.key === "Escape" && editingIndex != null) {
  e.preventDefault();
  cancelEdit();
}
}

const { supported, listening, start, stop } = useSpeechToText({
onText: (text, meta) => {
  const t = String(text || "").trim();
  if (!t) return;

  const base = baseRef.current.trim();

  if (meta?.interim) {
    interimRef.current = t;
    setInput(base ? `${base} ${t}` : t);
  } else {
    interimRef.current = "";
    setInput(base ? `${base} ${t}` : t);
  }

  focusInput();
},
onError: () => {
  interimRef.current = "";
  focusInput();
},
});

function onMicClick() {
if (!supported) {
  alert("Speech recognition not supported in this browser (try Chrome / Edge).");
  return;
}

if (listening) {
  stop();
  interimRef.current = "";
  focusInput();
  return;
}

baseRef.current = input.trim();
interimRef.current = "";

start();
focusInput();
}

async function onCopyAssistant(idx, text) {
const ok = await copyToClipboard(text);
if (!ok) return;

setCopiedAtIndex(idx);
setTimeout(() => setCopiedAtIndex(null), 1200);
}

return (

<div className="fixed inset-0 bg-[#f7f7f8] text-zinc-800">

  <div className="flex h-full overflow-hidden">

    {/* Mobile overlay */}
    {sidebarOpen && (
      <button
        type="button"
        aria-label="Close sidebar overlay"
        onClick={() => setSidebarOpen(false)}
        className="fixed inset-0 z-40 bg-black/30 md:hidden"
      />
    )}




    {/* Sidebar */}
    <aside
      className={classNames(
        "z-50 flex flex-col border-r border-gray-200 bg-[#f3f4f6]",
        "fixed inset-y-0 left-0 md:static",
        "transform transition-all duration-300 ease-in-out",
        sidebarOpen ? "translate-x-0" : "-translate-x-full",
        "md:translate-x-0",
        collapsed ? "w-20" : "w-72"
      )}
    >

      {/* HEADER */}
      <div className="p-2 flex items-center justify-between  border-gray-200">

        {/* LEFT SIDE */}
        <div
          className={`flex w-full ${collapsed
            ? "flex-col items-center gap-2"
            : "flex-row items-center justify-between"
            }`}
        >
          {/* LOGO */}
          <img
            src={collapsed ? logoSmall : logoFull}
            alt="logo"
            className={`object-contain transition-all duration-300 ${collapsed ? "h-8 w-8" : "h-12 w-auto"
              }`}
          />

          {/* TOGGLE BUTTON */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden md:flex p-4 rounded-lg hover:bg-gray-200"
          >
            <img
              src={collapsed ? sidebaropen : sidebarclose}
              className="w-5 h-5"
            />
          </button>
        </div>

        {/* MOBILE CLOSE */}
        <button
          onClick={() => setSidebarOpen(false)}
          className="md:hidden rounded-xl px-3 py-3 border border-gray-300 hover:bg-gray-200"
        >
          <img src={close} className="w-4 h-4" />
        </button>
      </div>

      {/* TITLE */}
      {!collapsed && (
        <div className="px-3 pb-3 mt-3 text-xs font-semibold tracking-wide text-zinc-500">
          Your chats
        </div>
      )}

      {/* CONTENT */}
      <div className="flex-1 overflow-auto px-2 pb-3">

        {collapsed ? (
          // 🔹 COLLAPSED MODE (icons only)
          <div className="flex flex-col items-center gap-3 mt-3">

            {/* NEW CHAT ICON */}
            <button
              onClick={onNewChat}
              className="p-2 rounded-lg hover:bg-gray-200"
            >
              <img src={newChatIcon} className="w-5 h-5" />
            </button>

            {/* SEARCH ICON */}
            <button className="p-2 rounded-lg hover:bg-gray-200">
              <img src={searchIcon} className="w-5 h-5" />
            </button>

          </div>
        ) : (
          // 🔹 EXPANDED MODE (normal button)
          <button
            onClick={onNewChat}
            className="w-full flex items-center gap-2 rounded-xl px-3 py-3 mb-2 text-zinc-800 hover:bg-gray-200 transition"
          >
            <img src={chat} className="w-5 h-5" />
            New chat
          </button>
        )}


        {!collapsed && (
          conversations
            .slice()
            .sort((a, b) => b.updatedAt - a.updatedAt)
            .map((c) => (
              <div
                key={c.id}
                className={classNames(
                  "relative group flex items-center justify-between rounded-lg px-3 py-2 mb-1",
                  c.id === activeId
                    ? "bg-blue-100 text-blue-700"
                    : "hover:bg-blue-100 text-zinc-800"
                )}
              >
                {/* CHAT TITLE */}
                {editingChatId === c.id ? (
                  <input
                    value={editingTitle}
                    autoFocus
                    onChange={(e) => setEditingTitle(e.target.value)}
                    onBlur={() => saveRename(c.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") saveRename(c.id);
                      if (e.key === "Escape") cancelRename();
                    }}
                    className="flex-1 text-sm px-2 py-1 rounded border border-gray-300 outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setActiveId(c.id)}
                    className="w-full flex-1 text-left text-sm truncate px-2 py-2 rounded transition-colors duration-200 hover:bg-blue-100 hover:text-blue-700"
                  >
                    {c.title}
                  </button>
                )}

                {/* 3 DOT BUTTON */}
                <button
                  onClick={() =>
                    setMenuOpenId(menuOpenId === c.id ? null : c.id)
                  }
                  className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-gray-300"
                >
                  ⋮
                </button>

                {/* DROPDOWN */}
                {menuOpenId === c.id && (
                  <div className="absolute right-2 top-10 w-32 bg-white border border-gray-200 rounded-lg shadow-md z-50">
                    <button
                      onClick={() => {
                        setEditingChatId(c.id);
                        setEditingTitle(c.title);
                        setMenuOpenId(null);
                      }} className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100"
                    >
                      Rename
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="w-full text-left px-3 py-2 text-sm text-red-500 hover:bg-gray-100"
                    >
                      Delete
                    </button>
                  </div>
                )}
              </div>
            ))
        )}
      </div>

      {/* FOOTER */}
      <div className="p-3 border-t border-gray-200">
        {collapsed ? (
          // 🔹 COLLAPSED → only profile image
          <div className="flex justify-center">
            <img
              src={userImg}
              alt="user"
              className="w-8 h-8 rounded-full object-cover"
            />
          </div>
        ) : (
          // 🔹 EXPANDED → user details
          <div className="flex items-center gap-3">
            {/* USER IMAGE */}
            <img
              src={userImg}
              alt="user"
              className="w-9 h-9 rounded-full object-cover"
            />

            {/* USER INFO */}
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-zinc-800">
                User
              </span>
              <span className="text-xs text-zinc-500">
                Chatbot v1.0
              </span>
            </div>
          </div>
        )}
      </div>
    </aside>

    {/* MAIN */}
    <main className="flex-1 flex flex-col overflow-hidden bg-white">

      {/* HEADER */}
      <header className="flex items-center justify-between bg-white border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">

          {/* MOBILE MENU */}
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
            loading
              ? "bg-amber-500/15 text-amber-300"
              : "bg-emerald-500/15 text-emerald-300"
          )}
        >
          {loading ? "Busy" : "Ready"}
        </span>
      </header>

      {/* Messages */}

      <section
        className="flex-1 overflow-y-auto px-4 py-6 pt-4 pb-28 overscroll-contain"
        onScroll={(e) => {
          const el = e.target;
          const isNearBottom =
            el.scrollHeight - el.scrollTop - el.clientHeight < 100;

          setShowScrollDown(!isNearBottom);
        }}
      >
        <div className="mx-auto max-w-4xl space-y-4">
          {activeConv?.messages?.map((m, idx) => {
            const isUser = m.role === "user";
            const isAssistant = m.role === "assistant";
            const isEditing = editingIndex === idx;

            return (
              <div key={idx} className="group">
                {/* User message: show edit button (ChatGPT style) */}
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

                {/* User message: edit mode inline */}
                {isUser && isEditing && (
                  <div className="rounded-2xl  bg-gray-100 p-3">
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
                        className="rounded-xl bg-amber-500 px-3 py-2 text-sm font-semibold text-white bg-green-600"
                      >
                        Save & resend
                      </button>
                    </div>
                  </div>
                )}

                {/* Assistant message: copy button */}
                {isAssistant && (
                  <div className="relative">
                    <MessageBubble
                      role={m.role}
                      text={m.text}
                      suggestions={m.suggestions}
                      onSuggestionClick={(text) => {
                        onSend({ overrideText: text });
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => onCopyAssistant(idx, m.text)}
                      className={`absolute -top-6 left-10 hidden group-hover:flex items-center gap-2 rounded-xl px-3 py-1 text-xs font-medium transition ${copiedAtIndex === idx
                        ? "bg-gray-300 text-zinc-800"
                        : "bg-gray-100 text-zinc-700 hover:bg-gray-200"
                        }`}
                      title="Copy response"
                    >
                      {copiedAtIndex === idx ? <FiCheck /> : <FiCopy />}
                      <span className="hidden sm:inline">
                        {copiedAtIndex === idx ? "Copied" : "Copy"}
                      </span>
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
          onClick={() =>
            bottomRef.current?.scrollIntoView({ behavior: "smooth" })
          }
          className="
    fixed bottom-20 right-6
    w-10 h-10
    flex items-center justify-center
    rounded-full
    bg-white/90 backdrop-blur
    border border-gray-300
    shadow-lg
    hover:bg-white hover:scale-105
    transition-all duration-200
    z-50
  "
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            className="w-5 h-5 text-gray-700"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </button>
      )}

      {/* Composer */}
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
                placeholder='Type or speak…'
                className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30"
              />

              {/* Stop button appears in composer like ChatGPT */}
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
                  className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center gap-2" title="Send"
                >
                  <FiSend className="text-lg" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              )}
            </div>

            {/* <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 px-1 text-xs text-zinc-600">
  <span>Enter to send</span>
  <span>•</span>
  <span>Shift+Enter for newline</span>
  <span>•</span>
  <span>Esc cancels edit</span>
</div> */}

            {!supported && (
              <div className="mt-2 px-1 text-xs text-amber-300">
                Voice input not supported in this browser. Try Chrome / Edge.
              </div>
            )}
          </div>
        </div>
      </footer>
    </main>
  </div>
</div>
);
}

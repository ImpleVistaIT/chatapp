import { useEffect, useMemo, useRef, useState } from "react";
import { sendChatMessage } from "../api/chatApi";
import { useSpeechToText } from "../hooks/useSpeechToText";

// ✅ NEW: split UI into 2 components
import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";

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
  const clean = text.trim();
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
      ],
      updatedAt: Date.now(),
    },
  ]);

  const [activeId, setActiveId] = useState("default");
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  // rename chat title
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  // sidebar UI state
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);

  // inline edit user message
  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState("");

  // copy feedback
  const [copiedAtIndex, setCopiedAtIndex] = useState(null);

  // abort controller
  const abortRef = useRef(null);

  // refs
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  // voice refs
  const baseRef = useRef("");
  const interimRef = useRef("");

  const activeConv = useMemo(
    () => conversations.find((c) => c.id === activeId),
    [conversations, activeId]
  );

  useEffect(() => {
    if (window.innerWidth > 768) inputRef.current?.focus();
  }, [activeId]);

  useEffect(() => {
    const scrollToBottom = () => {
      const el = bottomRef.current;
      if (!el) return;

      const container = el.closest("section");
      if (!container) return;

      container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
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
      prev.map((c) => (c.id === id ? { ...c, title: editingTitle } : c))
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

  function applyEditLocal({ removeFollowingAssistant = true } = {}) {
    const newText = editingText.trim();
    if (editingIndex == null || !newText) return null;

    updateActiveMessages((msgs) => {
      const copy = [...msgs];
      copy[editingIndex] = { ...copy[editingIndex], text: newText };

      if (removeFollowingAssistant) return copy.slice(0, editingIndex + 1);
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

      // auto update title if default
      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c;
          if (c.title === "New chat" || c.title === "SAP MM Chat") {
            return { ...c, title: generateTitle(text) };
          }
          return c;
        })
      );
    }

    setInput("");
    console.log("inputRef:", inputRef.current);
    setTimeout(() => inputRef.current?.blur(), 50);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const data = await sendChatMessage(text, {
        signal: controller.signal,
        conversationId: activeId,
      });

      updateActiveMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.reply ?? "",
          suggestions: data.suggestions,
        },
      ]);
    } catch (e) {
      if (e?.name === "AbortError") {
        updateActiveMessages((m) => [...m, { role: "assistant", text: "Stopped generating." }]);
      } else {
        updateActiveMessages((m) => [...m, { role: "assistant", text: `Error: ${e.message}` }]);
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

  // ✅ Keep scroll-down logic in Chat.jsx (logic stays here)
  function onMessagesScroll(e) {
    const el = e.target;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollDown(!isNearBottom);
  }

  return (
    <div className="fixed inset-0 bg-[#f7f7f8] text-zinc-800">
      <div className="flex h-full overflow-hidden">
        <Sidebar
          sidebarOpen={sidebarOpen}
          collapsed={collapsed}
          activeId={activeId}
          conversations={conversations}
          editingChatId={editingChatId}
          editingTitle={editingTitle}
          menuOpenId={menuOpenId}
          setSidebarOpen={setSidebarOpen}
          setCollapsed={setCollapsed}
          setMenuOpenId={setMenuOpenId}
          setEditingChatId={setEditingChatId}
          setEditingTitle={setEditingTitle}
          saveRename={saveRename}
          cancelRename={cancelRename}
          onNewChat={onNewChat}
          setActiveId={setActiveId}
          handleDelete={handleDelete}
        />

        <ChatWindow
          // state
          loading={loading}
          input={input}
          listening={listening}
          supported={supported}
          showScrollDown={showScrollDown}
          activeConv={activeConv}
          editingIndex={editingIndex}
          editingText={editingText}
          copiedAtIndex={copiedAtIndex}
          // refs
          bottomRef={bottomRef}
          inputRef={inputRef}
          // handlers
          setSidebarOpen={setSidebarOpen}
          setInput={setInput}
          onSend={onSend}
          onStop={onStop}
          onKeyDown={onKeyDown}
          onMicClick={onMicClick}
          onCopyAssistant={onCopyAssistant}
          startEditMessage={startEditMessage}
          cancelEdit={cancelEdit}
          applyEditLocal={applyEditLocal}
          setEditingText={setEditingText}
          onMessagesScroll={onMessagesScroll}
        />
      </div>
    </div>
  );
}
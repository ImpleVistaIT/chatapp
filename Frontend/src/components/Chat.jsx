import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { sendChatMessageStream } from "../api/chatApiStream";

import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";
import SapLogin from "../pages/saplogin";
import { authFetch } from "../api/authFetch";
import SolmanCreateCrForm from "./SolmanCreateCrForm";

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

function isMongoId(v) {
  return /^[a-f0-9]{24}$/i.test(String(v || ""));
}

function normalizeSystemId(sid) {
  return String(sid || "").trim().toUpperCase();
}

function normalizeActiveSession(v) {
  if (!v || !v.systemId || !v.sapUser) return null;
  return {
    systemId: normalizeSystemId(v.systemId),
    sapUser: String(v.sapUser).trim(),
    firstName: String(v.firstName || "").trim(),
    fullName: String(v.fullName || "").trim(),
  };
}

export default function Chat() {
  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  const userName = (() => {
    try {
      const system = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
      return system?.username || "User";
    } catch {
      return "User";
    }
  })();

  const [sapView, setSapView] = useState(() => {
    try {
      const force = localStorage.getItem("forceSapLogin") === "1";
      if (force) return "saplogin";
    } catch {}
    return "chat";
  });

  const [selectedSystem, setSelectedSystem] = useState(null);
  const [statusText, setStatusText] = useState("");
  const [showSolmanCrForm, setShowSolmanCrForm] = useState(false);

  const [activeSession, setActiveSession] = useState(() => {
    try {
      return normalizeActiveSession(JSON.parse(localStorage.getItem("sapActiveSession") || "null"));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    function syncActiveSessionFromStorage() {
      try {
        setActiveSession(normalizeActiveSession(JSON.parse(localStorage.getItem("sapActiveSession") || "null")));
      } catch {
        setActiveSession(null);
      }
    }

    function onStorage(e) {
      if (e.key === "sapActiveSession") syncActiveSessionFromStorage();
    }

    function onSapSessionChanged() {
      syncActiveSessionFromStorage();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("sapActiveSessionChanged", onSapSessionChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sapActiveSessionChanged", onSapSessionChanged);
    };
  }, []);

  useEffect(() => {
    if (activeSession) {
      localStorage.setItem("sapActiveSession", JSON.stringify(activeSession));
    } else {
      localStorage.removeItem("sapActiveSession");
    }
  }, [activeSession]);

  const isConnected = Boolean(activeSession?.systemId && activeSession?.sapUser);

  const [systems, setSystems] = useState([]);
  const [tiles, setTiles] = useState([]);
  const [tilesLoaded, setTilesLoaded] = useState(false);

  const loadSystems = useCallback(async () => {
    try {
      const res = await authFetch(`${apiBase}/sap/systems`, { method: "GET" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) return;
      const items = Array.isArray(payload.items) ? payload.items : [];
      setSystems(items);
    } catch {}
  }, [apiBase]);

  const loadTiles = useCallback(async () => {
    setTilesLoaded(false);
    try {
      const res = await authFetch(`${apiBase}/sap/tiles`, { method: "GET" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) return;
      const items = Array.isArray(payload.items) ? payload.items : [];
      setTiles(items);
    } catch {} finally {
      setTilesLoaded(true);
    }
  }, [apiBase]);

  useEffect(() => {
    function onChatSessionsChanged() {}
    window.addEventListener("chatSessionsChanged", onChatSessionsChanged);
    return () => window.removeEventListener("chatSessionsChanged", onChatSessionsChanged);
  }, []);

  useEffect(() => {
    let force = false;
    try {
      force = localStorage.getItem("forceSapLogin") === "1";
    } catch {}
    if (!force) setSapView("chat");

    loadSystems();
    loadTiles();
  }, [loadSystems, loadTiles]);

  useEffect(() => {
    if (!tilesLoaded) return;

    let force = false;
    try {
      force = localStorage.getItem("forceSapLogin") === "1";
    } catch {}

    if (force) {
      if (sapView !== "saplogin") setSapView("saplogin");
      return;
    }

    if (sapView !== "saplogin") setSapView("chat");
  }, [tilesLoaded, tiles, sapView]);

  const [conversations, setConversations] = useState(() => [
    {
      id: "draft",
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
  ]);

  const [activeId, setActiveId] = useState(() => {
    const saved = localStorage.getItem("chatSessionId");
    return isMongoId(saved) ? saved : "draft";
  });

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showScrollDown, setShowScrollDown] = useState(false);

  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState("");

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState(null);

  const [editingIndex, setEditingIndex] = useState(null);
  const [editingText, setEditingText] = useState("");

  const [copiedAtIndex, setCopiedAtIndex] = useState(null);

  const abortRef = useRef(null);
  const onStop = useCallback(() => {
    try {
      abortRef.current?.abort();
    } catch {}
  }, []);

  const sendingRef = useRef(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const baseRef = useRef("");
  const interimRef = useRef("");
  const cursorRef = useRef(null);

  const summaryConvIdsRef = useRef(new Set());

  const activeConv = useMemo(() => {
    const found = conversations.find((c) => c.id === activeId);
    if (found) return found;

    if (isMongoId(activeId)) {
      return { id: activeId, title: "New chat", messages: [], updatedAt: Date.now() };
    }

    return conversations[0] || null;
  }, [conversations, activeId]);

  useEffect(() => {
    if (!isMongoId(activeId)) return;

    const exists = conversations.some((c) => c.id === activeId);
    if (exists) return;

    setConversations((prev) => [{ id: activeId, title: "New chat", messages: [], updatedAt: Date.now() }, ...prev]);
  }, [activeId, conversations]);

  useEffect(() => {
    if (isMongoId(activeId)) {
      localStorage.setItem("chatSessionId", activeId);
    } else {
      localStorage.removeItem("chatSessionId");
    }

    if (activeId === "draft") {
      cursorRef.current = null;
    }
  }, [activeId]);

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
  }, [activeConv?.messages?.length, loading, showSolmanCrForm]);

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
    if (id === activeId) setActiveId("draft");
    setMenuOpenId(null);
  }

  function saveRename(id) {
    if (!editingTitle.trim()) return cancelRename();
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: editingTitle } : c)));
    setEditingChatId(null);
    setEditingTitle("");
  }

  function cancelRename() {
    setEditingChatId(null);
    setEditingTitle("");
  }

  function onNewChat() {
    setActiveId("draft");
    cursorRef.current = null;
    setShowSolmanCrForm(false);

    setConversations((prev) => {
      const withoutDraft = prev.filter((c) => c.id !== "draft");
      return [
        {
          id: "draft",
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
        ...withoutDraft,
      ];
    });

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

  const ensureSessionExistsLocally = useCallback((sessionId, firstUserText) => {
    if (!isMongoId(sessionId)) return;

    const title = generateTitle(firstUserText || "");

    setConversations((prev) => {
      if (prev.some((c) => String(c.id) === String(sessionId))) return prev;

      const hasDraft = prev.some((c) => c.id === "draft");
      if (hasDraft) {
        return prev.map((c) => (c.id === "draft" ? { ...c, id: sessionId, title, updatedAt: Date.now() } : c));
      }

      return [{ id: sessionId, title, messages: [], updatedAt: Date.now() }, ...prev];
    });
  }, []);

  async function onSend({ overrideText, fromEdit = false } = {}) {
    if (!isConnected) return;

    const text = String(overrideText ?? input).trim();
    if (!text || loading) return;
    if (sendingRef.current) return;
    sendingRef.current = true;

    const normalizedText = text.toLowerCase();

    if (
      normalizedText.includes("create change request") ||
      normalizedText.includes("create solman cr") ||
      normalizedText.includes("raise change request")
    ) {
      baseRef.current = "";
      interimRef.current = "";

      if (!fromEdit) {
        updateActiveMessages((m) => [...m, { role: "user", text }]);

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

      updateActiveMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Sure — please fill the required SolMan change request details.",
        },
      ]);

      setInput("");
      setShowSolmanCrForm(true);
      sendingRef.current = false;
      return;
    }

    baseRef.current = "";
    interimRef.current = "";

    if (!fromEdit) {
      updateActiveMessages((m) => [...m, { role: "user", text }]);

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeId) return c;
          if (c.title === "New chat" || c.title === "SAP MM Chat") return { ...c, title: generateTitle(text) };
          return c;
        })
      );
    }

    setInput("");
    setTimeout(() => inputRef.current?.blur(), 50);
    setLoading(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const isNextQuery = /\b(next|more|another|load|show\s+more)\b/i.test(text);
      if (!isNextQuery) cursorRef.current = null;

      const sessionIdToSend = isMongoId(activeId) ? activeId : null;

      summaryConvIdsRef.current = new Set([String(activeId)]);
      setStatusText("Interpreting your query...");

      let streamedPayload = null;

      await sendChatMessageStream(text, {
        apiBase,
        systemId: activeSession.systemId,
        sapUser: activeSession?.sapUser ? activeSession.sapUser : null,
        sessionId: sessionIdToSend,
        cursor: isNextQuery ? cursorRef.current : null,
        signal: controller.signal,

        onPhase: ({ message }) => {
          if (message) setStatusText(message);
        },

        onReply: (payload) => {
          streamedPayload = payload;
        },
      });

      const data = streamedPayload;
      if (!data) throw new Error("No reply received from stream");

      updateActiveMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: data.reply ?? "",
          suggestions: data.suggestions,
          summary: data.summary || "",
          summaryStatus: data.summary ? "done" : "pending",
        },
      ]);

      cursorRef.current = data?.cursor || null;

      if (data?.sessionId && isMongoId(data.sessionId)) {
        const newSessionId = data.sessionId;

        summaryConvIdsRef.current.add(String(newSessionId));

        if (activeId === "draft") {
          ensureSessionExistsLocally(newSessionId, text);

          const newTitle = generateTitle(text);
          authFetch(`${apiBase}/chat/sessions/${newSessionId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: newTitle }),
          }).catch(() => {});
        }

        setActiveId(newSessionId);
        window.dispatchEvent(new Event("chatSessionsChanged"));
      }
    } catch (e) {
      if (e?.name === "AbortError") {
        updateActiveMessages((m) => [...m, { role: "assistant", text: "Stopped generating." }]);
      } else {
        updateActiveMessages((m) => [...m, { role: "assistant", text: `Error: ${e.message}` }]);
      }
    } finally {
      setLoading(false);
      sendingRef.current = false;
      abortRef.current = null;
      setStatusText("");
    }
  }

  function onKeyDown(e) {
    if (editingIndex != null) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const newText = applyEditLocal({ removeFollowingAssistant: true });
        if (newText) onSend({ overrideText: newText, fromEdit: true });
        return;
      }

      if (e.key === "Escape") {
        e.preventDefault();
        cancelEdit();
        return;
      }
    }
  }

  const { supported, listening, start, stop } = useSpeechToText({
    onText: (text, meta) => {
      if (!isConnected) return;
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

    if (!isConnected) return;

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

  function onMessagesScroll(e) {
    const el = e.target;
    const isNearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
    setShowScrollDown(!isNearBottom);
  }

  const handleConnectedFromSapLogin = async (payload) => {
    try {
      localStorage.removeItem("forceSapLogin");
    } catch {}

    await loadTiles();
    await loadSystems();

    const sid = normalizeSystemId(payload?.systemId || payload?.system?.systemId);
    const sapUser = String(payload?.sapUser || payload?.system?.sapUser || "").trim();

    if (sid && sapUser) {
      const next = normalizeActiveSession({
        systemId: sid,
        sapUser,
        firstName: payload?.firstName,
        fullName: payload?.fullName,
      });

      setActiveSession(next);
      localStorage.setItem("sapActiveSession", JSON.stringify(next));
      window.dispatchEvent(new Event("sapActiveSessionChanged"));
    }

    setSapView("chat");
    setSelectedSystem(null);
  };

  const handleDisconnect = async () => {
    setActiveSession(null);
    localStorage.removeItem("sapActiveSession");
    window.dispatchEvent(new Event("sapActiveSessionChanged"));
    setShowSolmanCrForm(false);

    authFetch(`${apiBase}/sap/disconnect`, { method: "POST" }).catch(() => {});
  };

  const openSapLogin = (system = null) => {
    try {
      localStorage.removeItem("forceSapLogin");
    } catch {}

    setSelectedSystem(system);
    setSapView("saplogin");
    setShowSolmanCrForm(false);
  };

  const handleSystemSelect = useCallback(
    (system) => {
      setSelectedSystem(system);

      try {
        const prev = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
        const payload = {
          systemId: system?.systemId ? normalizeSystemId(system.systemId) : null,
          name: system?.name || "",
          username: prev?.username || "User",
          sapUser: system?.sapUser || prev?.sapUser || null,
        };

        if (payload.systemId) {
          localStorage.setItem("sapActiveSystem", JSON.stringify(payload));
        }
      } catch {}

      localStorage.removeItem("chatSessionId");
      setActiveId("draft");
      onNewChat();
    },
    [onNewChat]
  );

  const solmanCreateCrForm = showSolmanCrForm ? (
    <div className="px-4 pb-4">
      <SolmanCreateCrForm
        systemId={activeSession?.systemId || "HSM"}
        sapUser={activeSession?.sapUser || ""}
        onCancel={() => setShowSolmanCrForm(false)}
        onSuccess={(data) => {
          setShowSolmanCrForm(false);
          updateActiveMessages((m) => [
            ...m,
            {
              role: "assistant",
              text: `CR ${data.changeRequestId} created successfully. Status: ${data.status}`,
            },
          ]);
        }}
      />
    </div>
  ) : null;

  return (
    <div className="fixed inset-0 bg-[#f7f7f8] text-zinc-800">
      {sapView === "saplogin" ? (
        <SapLogin
          onConnected={handleConnectedFromSapLogin}
          selectedSystem={selectedSystem}
          onBack={() => {
            let force = false;
            try {
              force = localStorage.getItem("forceSapLogin") === "1";
            } catch {}
            if (force) return;

            setSapView("chat");
            setSelectedSystem(null);
          }}
        />
      ) : (
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
            userName={userName}
            onAddNewSystem={() => openSapLogin(null)}
            systems={systems}
            onOpenSapLogin={openSapLogin}
            onSystemsChanged={async () => {
              await loadSystems();
              await loadTiles();
            }}
            activeSession={activeSession}
          />

          <ChatWindow
            loading={loading}
            input={input}
            listening={listening}
            supported={supported}
            showScrollDown={showScrollDown}
            activeConv={activeConv}
            editingIndex={editingIndex}
            editingText={editingText}
            statusText={statusText}
            copiedAtIndex={copiedAtIndex}
            bottomRef={bottomRef}
            inputRef={inputRef}
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
            onDisconnect={handleDisconnect}
            userName={userName}
            onOpenSapLogin={openSapLogin}
            systems={systems}
            onSystemSelect={handleSystemSelect}
            setConversations={setConversations}
            activeSession={activeSession}
            setActiveSession={setActiveSession}
            setActiveId={setActiveId}
            onConnected={async () => {
              await loadTiles();
              await loadSystems();
            }}
            tiles={tiles}
            showSolmanCrForm={showSolmanCrForm}
            setShowSolmanCrForm={setShowSolmanCrForm}
            solmanCreateCrForm={solmanCreateCrForm}
          />
        </div>
      )}
    </div>
  );
}
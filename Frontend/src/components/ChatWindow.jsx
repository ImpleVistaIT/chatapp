import { FiMic, FiMicOff, FiSend, FiSquare } from "react-icons/fi";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import { authFetch } from "../api/authFetch";

import ChatHeader from "./chat/ChatHeader.jsx";
import ChatScreen from "./chat/ChatScreen.jsx";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

export default function ChatWindow({
  loading,
  input,
  listening,
  supported,
  showScrollDown,
  statusText,

  activeConv,
  editingIndex,
  editingText,
  copiedAtIndex,
  bottomRef,
  inputRef,
  setSidebarOpen,
  setInput,
  onSend,
  onKeyDown,
  onMicClick,
  onCopyAssistant,
  startEditMessage,
  cancelEdit,
  applyEditLocal,
  setEditingText,
  onDisconnect,
  onOpenSapLogin,
  onMessagesScroll,
  userName = "User",
  systems = [],
  onSystemSelect = () => {},
  setConversations = null,
  setActiveId = null,
  onConnected = null,

  tiles = [],

  activeSession,
  setActiveSession,

  onStop,

  showSolmanCrForm = false,
  setShowSolmanCrForm = () => {},
  solmanCreateCrForm = null,
}) {
  const [showSystemDropdown, setShowSystemDropdown] = useState(false);
  const [connectingSystemId, setConnectingSystemId] = useState(null);

  const apiBase = import.meta.env.VITE_API_BASE_URL || `${window.location.protocol}//${window.location.hostname}:3000`;

  const isConnected = Boolean(activeSession?.systemId && activeSession?.sapUser);

  const [msgNextBefore, setMsgNextBefore] = useState(null);
  const [msgLoadingMore, setMsgLoadingMore] = useState(false);
  const [msgHasMore, setMsgHasMore] = useState(true);

  const messagesElRef = useRef(null);

  const isMongoId = useCallback((v) => /^[a-f0-9]{24}$/i.test(String(v || "")), []);
  const normalizeSystemId = useCallback((sid) => String(sid || "").trim().toUpperCase(), []);

  const sessionId = useMemo(() => {
    const id = activeConv?.id;
    return typeof id === "string" ? id : null;
  }, [activeConv?.id]);

  const canFetchDbMessages = Boolean(sessionId && isMongoId(sessionId));

  const systemList = useMemo(() => {
    if (Array.isArray(systems) && systems.length > 0) return systems;
    return [
      { id: "1", name: "PRD", systemId: "PRD", active: true },
      { id: "2", name: "System 2", systemId: "SYS", active: false },
    ];
  }, [systems]);

  const prependActiveMessages = useCallback(
    (olderMessages) => {
      if (typeof setConversations !== "function") return;
      if (!activeConv?.id) return;

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== activeConv.id) return c;
          const existing = Array.isArray(c.messages) ? c.messages : [];
          return { ...c, messages: [...olderMessages, ...existing], updatedAt: c.updatedAt || Date.now() };
        })
      );
    },
    [activeConv?.id, setConversations]
  );

  const ensureSapActiveSystemStored = useCallback(
    (system, { sapUserOverride } = {}) => {
      const sid = normalizeSystemId(system?.systemId || system?.name);
      if (!sid) return;

      let prev = null;
      try {
        prev = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
      } catch {
        prev = null;
      }

      const activeSystem = {
        systemId: sid,
        name: system?.name || system?.description || sid,
        protocol: system?.protocol || prev?.protocol || "https",
        host: system?.host || prev?.host || "",
        port: system?.port ?? prev?.port ?? null,
        sapRouter: system?.sapRouter || prev?.sapRouter || "",
        username: system?.username || prev?.username || "",
        sapUser: sapUserOverride || system?.sapUser || prev?.sapUser || null,
      };

      localStorage.setItem("sapActiveSystem", JSON.stringify(activeSystem));
    },
    [normalizeSystemId]
  );

  const fetchSapProfile = useCallback(
    async ({ systemId, sapUser }) => {
      const sid = normalizeSystemId(systemId);
      const su = String(sapUser || "").trim();
      if (!sid || !su) return { firstName: "", fullName: "" };

      try {
        const profRes = await authFetch(`${apiBase}/sap/user-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemId: sid, sapUser: su }),
        });

        const profPayload = await profRes.json().catch(() => ({}));
        if (!profRes.ok || profPayload?.ok !== true) return { firstName: "", fullName: "" };

        const p = profPayload.profile || profPayload;
        const firstName = String(p?.firstName || p?.Firstname || "").trim();
        const fullName = String(p?.fullName || p?.Fullname || "").trim();
        return { firstName, fullName };
      } catch {
        return { firstName: "", fullName: "" };
      }
    },
    [apiBase, normalizeSystemId]
  );

  const fetchLatestMessages = useCallback(async () => {
    if (!canFetchDbMessages) return;

    setMsgLoadingMore(true);
    try {
      let sid = "";
      try {
        const active = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
        sid = normalizeSystemId(active?.systemId);
      } catch {
        sid = "";
      }

      const url = new URL(`${apiBase}/chat/sessions/${sessionId}/messages`);
      url.searchParams.set("limit", "20");
      if (sid) url.searchParams.set("systemId", sid);

      const res = await authFetch(url.toString(), { method: "GET" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) {
        throw new Error(payload?.error || `Failed to load messages (${res.status})`);
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      const nextBefore = payload.nextBefore || null;

      const uiMessages = items.map((m) => ({
        role: m.role,
        text: m.text,
        summary: m.summary,
        data: m.data,
        suggestions: m.suggestions,
      }));

      if (typeof setConversations === "function" && activeConv?.id) {
        setConversations((prev) =>
          prev.map((c) => {
            if (c.id !== activeConv.id) return c;
            return { ...c, messages: uiMessages, updatedAt: Date.now() };
          })
        );
      }

      setMsgNextBefore(nextBefore);
      setMsgHasMore(Boolean(nextBefore) && items.length > 0);

      setTimeout(() => {
        bottomRef?.current?.scrollIntoView?.({ behavior: "auto" });
      }, 0);
    } catch (e) {
      console.error("Failed to fetch latest messages:", e);
    } finally {
      setMsgLoadingMore(false);
    }
  }, [apiBase, bottomRef, canFetchDbMessages, normalizeSystemId, sessionId, setConversations, activeConv?.id]);

  const fetchOlderMessages = useCallback(async () => {
    if (!canFetchDbMessages) return;
    if (!msgHasMore || msgLoadingMore) return;
    if (!msgNextBefore) return;

    const el = messagesElRef.current;
    const prevScrollHeight = el?.scrollHeight || 0;
    const prevScrollTop = el?.scrollTop || 0;

    setMsgLoadingMore(true);
    try {
      let sid = "";
      try {
        const active = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
        sid = normalizeSystemId(active?.systemId);
      } catch {
        sid = "";
      }

      const url = new URL(`${apiBase}/chat/sessions/${sessionId}/messages`);
      url.searchParams.set("limit", "20");
      url.searchParams.set("before", msgNextBefore);
      if (sid) url.searchParams.set("systemId", sid);

      const res = await authFetch(url.toString(), { method: "GET" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) {
        throw new Error(payload?.error || `Failed to load older messages (${res.status})`);
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      const nextBefore = payload.nextBefore || null;

      const uiMessages = items.map((m) => ({
        role: m.role,
        text: m.text,
        summary: m.summary,
        data: m.data,
        suggestions: m.suggestions,
      }));

      prependActiveMessages(uiMessages);

      setMsgNextBefore(nextBefore);
      setMsgHasMore(Boolean(nextBefore) && items.length > 0);

      setTimeout(() => {
        const newScrollHeight = el?.scrollHeight || 0;
        const delta = newScrollHeight - prevScrollHeight;
        if (el) el.scrollTop = prevScrollTop + delta;
      }, 0);
    } catch (e) {
      console.error("Failed to fetch older messages:", e);
    } finally {
      setMsgLoadingMore(false);
    }
  }, [apiBase, canFetchDbMessages, msgHasMore, msgLoadingMore, msgNextBefore, normalizeSystemId, prependActiveMessages, sessionId]);

  useEffect(() => {
    setMsgNextBefore(null);
    setMsgHasMore(true);

    if (canFetchDbMessages) {
      fetchLatestMessages();
    }
  }, [canFetchDbMessages, fetchLatestMessages]);

  const onMessagesScrollInternal = useCallback(
    (e) => {
      onMessagesScroll?.(e);
      const el = e.target;
      if (el.scrollTop < 60) fetchOlderMessages();
    },
    [fetchOlderMessages, onMessagesScroll]
  );

  const handleSystemSelect = useCallback(
    async (tileOrSystem) => {
      setShowSystemDropdown(false);

      const sid = normalizeSystemId(tileOrSystem?.systemId || tileOrSystem?.name);
      const sapUser = String(tileOrSystem?.sapUser || tileOrSystem?.system?.sapUser || tileOrSystem?.user || "").trim();

      if (!sid) return;

      if (!sapUser) {
        toast.error("Login required (no SAP user found).");
        onOpenSapLogin?.(tileOrSystem);
        return;
      }

      localStorage.removeItem("chatSessionId");
      if (typeof setActiveId === "function") setActiveId("draft");

      setConnectingSystemId(`${sid}:${sapUser}`);

      try {
        const connRes = await authFetch(`${apiBase}/sap/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemId: sid, sapUser, validate: true }),
        });

        const connPayload = await connRes.json().catch(() => ({}));
        if (!connRes.ok || connPayload?.ok !== true) {
          throw new Error(connPayload?.error || `Connect failed (${connRes.status})`);
        }

        const connectedSapUser = String(connPayload?.sapUser || sapUser).trim();

        const { firstName, fullName } = await fetchSapProfile({ systemId: sid, sapUser: connectedSapUser });

        ensureSapActiveSystemStored(tileOrSystem, { sapUserOverride: connectedSapUser });
        onSystemSelect?.(tileOrSystem);

        const next = { systemId: sid, sapUser: connectedSapUser, firstName, fullName };
        setActiveSession?.(next);

        localStorage.setItem("sapActiveSession", JSON.stringify(next));
        window.dispatchEvent(new Event("sapActiveSessionChanged"));

        localStorage.removeItem("sapConnected");

        if (typeof onConnected === "function") onConnected();

        if (typeof setConversations === "function") {
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
        }

        toast.success(`Connected to ${tileOrSystem?.name || tileOrSystem?.description || sid} (${connectedSapUser})`);
      } catch (e) {
        console.error("Connect failed:", e);
        toast.error(e?.message || "Connect failed. Please login again.");
        onOpenSapLogin?.(tileOrSystem);
      } finally {
        setConnectingSystemId(null);
      }
    },
    [
      apiBase,
      ensureSapActiveSystemStored,
      fetchSapProfile,
      normalizeSystemId,
      onConnected,
      onOpenSapLogin,
      onSystemSelect,
      setActiveId,
      setConversations,
      setActiveSession,
    ]
  );

  const onComposerKeyDown = useCallback(
    (e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!isConnected) return;
        if (loading) return;
        if (!String(input || "").trim()) return;
        onSend?.();
      }
    },
    [onKeyDown, isConnected, loading, input, onSend]
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-white">
      <ChatHeader
        setSidebarOpen={setSidebarOpen}
        showSystemDropdown={showSystemDropdown}
        setShowSystemDropdown={setShowSystemDropdown}
        connectingSystemId={connectingSystemId}
        tiles={tiles}
        normalizeSystemId={normalizeSystemId}
        handleSystemSelect={handleSystemSelect}
        onDisconnect={onDisconnect}
        onAddNewSystem={onOpenSapLogin}
        activeSession={activeSession}
        setActiveSession={setActiveSession}
      />

      <ChatScreen
        isConnected={isConnected}
        userName={userName}
        systemList={systemList}
        tiles={tiles}
        onAddNewSystem={() => onOpenSapLogin?.(null)}
        statusText={statusText}
        normalizeSystemId={normalizeSystemId}
        handleSystemSelect={handleSystemSelect}
        showSystemDropdown={showSystemDropdown}
        setShowSystemDropdown={setShowSystemDropdown}
        connectingSystemId={connectingSystemId}
        messagesElRef={messagesElRef}
        onMessagesScrollInternal={onMessagesScrollInternal}
        activeConv={activeConv}
        msgLoadingMore={msgLoadingMore}
        editingIndex={editingIndex}
        editingText={editingText}
        setEditingText={setEditingText}
        startEditMessage={startEditMessage}
        cancelEdit={cancelEdit}
        applyEditLocal={applyEditLocal}
        onSend={onSend}
        onCopyAssistant={onCopyAssistant}
        copiedAtIndex={copiedAtIndex}
        loading={loading}
        bottomRef={bottomRef}
        showScrollDown={showScrollDown}
      />

      {isConnected && solmanCreateCrForm}

      {isConnected && (
        <footer className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-200 flex-shrink-0">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl border border-gray-300 bg-gray-100 p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (loading) return;
                  onSend();
                }}
              >
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={onMicClick}
                    disabled={!isConnected}
                    className={classNames(
                      "rounded-xl px-3 py-2 border transition flex items-center justify-center",
                      listening
                        ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-700"
                        : "bg-white text-zinc-700 border-gray-300 hover:bg-gray-200",
                      !isConnected && "opacity-50 cursor-not-allowed"
                    )}
                    title={listening ? "Stop microphone" : "Start microphone"}
                  >
                    {listening ? <FiMicOff className="text-lg" /> : <FiMic className="text-lg" />}
                  </button>

                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={2}
                    placeholder={isConnected ? "Start type a message… " : "Click Connect to start chatting…"}
                    disabled={!isConnected}
                    className="flex-1 resize-none rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-zinc-800 placeholder:text-zinc-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-400/30 disabled:bg-gray-100 disabled:text-gray-400"
                  />

                  {loading ? (
                    <button
                      type="button"
                      onClick={() => onStop?.()}
                      className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-700 flex items-center gap-2"
                      title="Stop generating"
                    >
                      <FiSquare className="text-lg" />
                      <span className="hidden sm:inline">Stop</span>
                    </button>
                  ) : (
                    <button
                      disabled={!isConnected || !String(input || "").trim()}
                      className="rounded-xl bg-green-600 px-4 py-2 text-sm font-semibold text-white hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-500 disabled:cursor-not-allowed flex items-center gap-2"
                      type="submit"
                      title="Send"
                    >
                      <FiSend className="text-lg" />
                      <span className="hidden sm:inline">Send</span>
                    </button>
                  )}
                </div>
              </form>

              {!supported && (
                <div className="mt-2 px-1 text-xs text-amber-300">
                  Voice input not supported in this browser. Try Chrome / Edge.
                </div>
              )}
            </div>
          </div>
        </footer>
      )}
    </main>
  );
}
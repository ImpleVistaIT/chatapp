import { FiMic, FiMicOff, FiSend, FiSquare } from "react-icons/fi";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { toast } from "react-hot-toast";
import { authFetch } from "../api/authFetch";

import ChatHeader from "./chat/ChatHeader.jsx";
import ChatScreen from "./chat/ChatScreen.jsx";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

function normalizeBool(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const v = value.trim().toLowerCase();
    if (["true", "yes", "1", "connected", "online", "active"].includes(v)) return true;
    if (["false", "no", "0", "disconnected", "offline", "inactive"].includes(v)) return false;
  }
  return fallback;
}

function mapSuggestionsFromMessage(message = {}) {
  if (Array.isArray(message?.suggestions) && message.suggestions.length > 0) {
    return message.suggestions;
  }

  const actionOptions = message?.data?.action?.options;
  if (Array.isArray(actionOptions) && actionOptions.length > 0) {
    return actionOptions
      .map((option) => {
        if (typeof option === "string") return option;
        if (option && typeof option === "object") {
          return option.label || option.value || "";
        }
        return "";
      })
      .filter(Boolean);
  }

  if (
    message?.role === "assistant" &&
    message?.data?.missingFields?.includes?.("processType")
  ) {
    return ["ROW", "INDIA"];
  }

  return [];
}

function mapDbMessageToUi(message = {}) {
  return {
    role: message?.role,
    text: message?.text,
    summary: message?.summary,
    data: message?.data,
    suggestions: mapSuggestionsFromMessage(message),
  };
}

export default function ChatWindow({
  loading,
  input,
  listening,
  supported,
  showScrollDown,
  statusText,

  activeConv,
  sessionId = null,
  editingIndex,
  editingText,
  copiedAtIndex,
  bottomRef,
  inputRef,
  setSidebarOpen,
  setInput,
  onSend,
  pendingAction,
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
  const [localConnectedSession, setLocalConnectedSession] = useState(null);

  const apiBase =
    import.meta.env.VITE_API_BASE_URL ||
    `${window.location.protocol}//${window.location.hostname}:3000`;

  const normalizeSystemId = useCallback((sid) => String(sid || "").trim().toUpperCase(), []);

  const normalizedAvailableSystems = useMemo(() => {
    const tileList = Array.isArray(tiles) ? tiles : [];

    return tileList
      .map((tile) => {
        const system = tile?.system && typeof tile.system === "object" ? tile.system : {};

        const systemId = normalizeSystemId(
          tile?.systemId ||
            system?.systemId ||
            tile?.name ||
            system?.name ||
            tile?.code ||
            system?.code
        );

        const host = String(tile?.host || system?.host || "").trim().toLowerCase();
        const protocol = String(tile?.protocol || system?.protocol || "https").trim().toLowerCase();
        const rawPort = tile?.port ?? system?.port ?? "";
        const port = String(rawPort).trim();
        const status = String(tile?.status || system?.status || "").trim().toLowerCase();

        const connected =
          tile?.connected === true ||
          tile?.isConnected === true ||
          system?.connected === true ||
          system?.isConnected === true ||
          status === "connected" ||
          status === "online" ||
          status === "active" ||
          normalizeBool(tile?.active, false) ||
          normalizeBool(system?.active, false);

        return {
          systemId,
          host,
          port,
          protocol,
          connected,
          isConnected: connected,
          status: connected ? "connected" : status || "disconnected",
          name:
            tile?.name ||
            system?.name ||
            tile?.description ||
            system?.description ||
            systemId,
          sapUser:
            tile?.sapUser ||
            system?.sapUser ||
            tile?.user ||
            system?.user ||
            "",
        };
      })
      .filter((item) => item.systemId || (item.host && item.port));
  }, [tiles, normalizeSystemId]);

  useEffect(() => {
    console.log("[ChatWindow] tiles:", tiles);
    console.log("[ChatWindow] normalizedAvailableSystems:", normalizedAvailableSystems);
  }, [tiles, normalizedAvailableSystems]);

  useEffect(() => {
    if (!activeSession?.systemId) {
      setLocalConnectedSession(null);
    }
  }, [activeSession?.systemId]);

  const effectiveSession = localConnectedSession || activeSession || null;

  const activeSystemId = normalizeSystemId(effectiveSession?.systemId || "");
  const activeSapUser = String(effectiveSession?.sapUser || "").trim();

  const resolvedSessionId = useMemo(() => {
    if (sessionId) return sessionId;
    const id = activeConv?.id;
    return typeof id === "string" ? id : null;
  }, [sessionId, activeConv?.id]);

  const buildSendPayload = useCallback(
    (overrides = {}) => {
      const {
        systemId: _ignoredSystemId,
        sapUser: overrideSapUser,
        ...rest
      } = overrides || {};

      return {
        availableSystems: normalizedAvailableSystems,
        systemId: activeSystemId || "",
        sapUser: overrideSapUser ?? activeSapUser ?? "",
        sessionId: resolvedSessionId,
        ...rest,
      };
    },
    [normalizedAvailableSystems, activeSystemId, activeSapUser, resolvedSessionId]
  );

  const hasConnectedSystems = useMemo(() => {
    return normalizedAvailableSystems.some(
      (tile) =>
        tile?.connected === true ||
        tile?.isConnected === true ||
        tile?.status === "connected"
    );
  }, [normalizedAvailableSystems]);

const isConnected = useMemo(() => {
  // immediate frontend connection state
  if (localConnectedSession?.systemId) {
    return true;
  }

  // backend tiles state
  if (hasConnectedSystems) {
    return true;
  }

  if (!activeSystemId) {
    return false;
  }

  return normalizedAvailableSystems.some(
    (item) =>
      normalizeSystemId(item?.systemId) === activeSystemId &&
      (
        item?.connected === true ||
        item?.isConnected === true ||
        item?.status === "connected"
      )
  );
}, [
  localConnectedSession,
  hasConnectedSystems,
  normalizedAvailableSystems,
  activeSystemId,
  normalizeSystemId,
]);
  const canInteract = isConnected && !connectingSystemId;

  const [msgNextBefore, setMsgNextBefore] = useState(null);
  const [msgLoadingMore, setMsgLoadingMore] = useState(false);
  const [msgHasMore, setMsgHasMore] = useState(true);

  const messagesElRef = useRef(null);

  const isMongoId = useCallback((v) => /^[a-f0-9]{24}$/i.test(String(v || "")), []);

  const canFetchDbMessages = Boolean(resolvedSessionId && isMongoId(resolvedSessionId));

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
          return {
            ...c,
            messages: [...olderMessages, ...existing],
            updatedAt: c.updatedAt || Date.now(),
          };
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
        if (!profRes.ok || profPayload?.ok !== true) {
          return { firstName: "", fullName: "" };
        }

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

      const url = new URL(`${apiBase}/chat/sessions/${resolvedSessionId}/messages`);
      url.searchParams.set("limit", "20");
      if (sid) url.searchParams.set("systemId", sid);

      const res = await authFetch(url.toString(), { method: "GET" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) {
        throw new Error(payload?.error || `Failed to load messages (${res.status})`);
      }

      const items = Array.isArray(payload.items) ? payload.items : [];
      const nextBefore = payload.nextBefore || null;

      const uiMessages = items.map(mapDbMessageToUi);

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
  }, [
    apiBase,
    bottomRef,
    canFetchDbMessages,
    normalizeSystemId,
    resolvedSessionId,
    setConversations,
    activeConv?.id,
  ]);

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

      const url = new URL(`${apiBase}/chat/sessions/${resolvedSessionId}/messages`);
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

      const uiMessages = items.map(mapDbMessageToUi);

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
  }, [
    apiBase,
    canFetchDbMessages,
    msgHasMore,
    msgLoadingMore,
    msgNextBefore,
    normalizeSystemId,
    prependActiveMessages,
    resolvedSessionId,
  ]);

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
      const sapUser = String(
        tileOrSystem?.sapUser || tileOrSystem?.system?.sapUser || tileOrSystem?.user || ""
      ).trim();

      if (!sid) return;

      if (!sapUser) {
        toast.error("Login required (no SAP user found).");
        onOpenSapLogin?.(tileOrSystem);
        return;
      }

      // clear storage
    localStorage.removeItem("sapConnected");
    localStorage.removeItem("sapActiveSession");
    localStorage.removeItem("sapActiveSystem");
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

        const { firstName, fullName } = await fetchSapProfile({
          systemId: sid,
          sapUser: connectedSapUser,
        });

        const connectedSystem = {
          ...tileOrSystem,
          systemId: sid,
          sapUser: connectedSapUser,
          connected: true,
          isConnected: true,
          status: "connected",
          active: true,
        };

        ensureSapActiveSystemStored(connectedSystem, {
          sapUserOverride: connectedSapUser,
        });
        onSystemSelect?.(connectedSystem);

        const next = {
          systemId: sid,
          sapUser: connectedSapUser,
          firstName,
          fullName,
        };

        setLocalConnectedSession(next);
        setActiveSession?.(next);

        localStorage.setItem("sapActiveSession", JSON.stringify(next));
        window.dispatchEvent(new Event("sapActiveSessionChanged"));

        localStorage.setItem("sapConnected", "true");

        if (typeof onConnected === "function") {
          await onConnected();
        }

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

        toast.success(
          `Connected to ${
            tileOrSystem?.name || tileOrSystem?.description || sid
          } (${connectedSapUser})`
        );
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

  const handleDisconnectSystem = useCallback(async (system) => {
  try {
    const sid = normalizeSystemId(system?.systemId);

    // optional backend disconnect API
    await authFetch(`${apiBase}/sap/disconnect`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        systemId: sid,
      }),
    }).catch(() => {});

    // clear local states
    setLocalConnectedSession(null);

    setActiveSession?.(null);

    // clear storage
    localStorage.removeItem("sapConnected");
    localStorage.removeItem("sapActiveSession");
    localStorage.removeItem("sapActiveSystem");

    // notify app
    window.dispatchEvent(new Event("sapActiveSessionChanged"));
    window.dispatchEvent(new Event("sapConnectionChanged"));

    toast.success(`${sid} disconnected`);
  } catch (e) {
    console.error("Disconnect failed:", e);
    toast.error("Disconnect failed");
  }
},[apiBase, normalizeSystemId, setActiveSession]);

  const handleSuggestionSend = useCallback(
    (value) => {
      console.log("[ChatWindow] suggestion send", {
        rawValue: value,
        activeSystemId,
        activeSapUser,
        sessionId: resolvedSessionId,
        activeConvId: activeConv?.id,
      });

      if (value && typeof value === "object" && !Array.isArray(value)) {
        if (value?.action?.type === "add_system") {
          onOpenSapLogin?.(null);
          return;
        }

        const safeOverrideText = String(
          value?.overrideText || value?.text || value?.label || ""
        ).trim();

        const safeDisplayText = String(
          value?.displayText || value?.text || value?.label || safeOverrideText
        ).trim();

        const safeBusinessScope = String(value?.businessScope || "").trim().toUpperCase();
        const isBusinessScope =
          safeBusinessScope === "ROW" || safeBusinessScope === "INDIA";

        onSend?.(
          buildSendPayload({
            overrideText: safeOverrideText,
            displayText: safeDisplayText,
            businessScope: isBusinessScope ? safeBusinessScope : "",
            pendingContext: value?.pendingContext ?? pendingAction ?? null,
            sessionId: resolvedSessionId,
          })
        );
        return;
      }

      const text = String(value || "").trim();
      if (!text) return;

      if (text === "Add System") {
        onOpenSapLogin?.(null);
        return;
      }

      const upper = text.toUpperCase();
      const isBusinessScope = upper === "ROW" || upper === "INDIA";

      onSend?.(
        buildSendPayload({
          overrideText: text,
          displayText: text,
          businessScope: isBusinessScope ? upper : "",
          pendingContext: pendingAction || null,
          sessionId: resolvedSessionId,
        })
      );
    },
    [
      buildSendPayload,
      onOpenSapLogin,
      onSend,
      pendingAction,
      activeSystemId,
      activeSapUser,
      resolvedSessionId,
      activeConv?.id,
    ]
  );

  const handleReconnectSuggestion = useCallback(
    async (systemId) => {
      const sid = normalizeSystemId(systemId);
      if (!sid) {
        onOpenSapLogin?.(null);
        return;
      }

      const candidate = (Array.isArray(tiles) ? tiles : []).find(
        (tile) => normalizeSystemId(tile?.systemId || tile?.name) === sid
      );

      if (!candidate) {
        onOpenSapLogin?.(null);
        return;
      }

      const sapUser = String(
        candidate?.sapUser || candidate?.system?.sapUser || candidate?.user || ""
      ).trim();

      if (!sapUser) {
        onOpenSapLogin?.(candidate);
        return;
      }

      await handleSystemSelect(candidate);
    },
    [handleSystemSelect, normalizeSystemId, onOpenSapLogin, tiles]
  );

  const onComposerKeyDown = useCallback(
    (e) => {
      onKeyDown?.(e);
      if (e.defaultPrevented) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        if (!canInteract) return;
        if (loading) return;
        if (!String(input || "").trim()) return;
        console.log("[ChatWindow] composer send", {
          activeSystemId,
          activeSapUser,
          normalizedAvailableSystems,
          sessionId: resolvedSessionId,
        });
        onSend?.(
          buildSendPayload({
            overrideText: input,
            displayText: input,
            sessionId: resolvedSessionId,
          })
        );
      }
    },
    [
      onKeyDown,
      canInteract,
      loading,
      input,
      onSend,
      buildSendPayload,
      activeSystemId,
      activeSapUser,
      normalizedAvailableSystems,
      resolvedSessionId,
    ]
  );

  return (
    <main className="flex-1 flex flex-col overflow-hidden bg-white">
      <ChatHeader
        setSidebarOpen={setSidebarOpen}
        onAddNewSystem={onOpenSapLogin}
        showAddSystemButton={!isConnected}
        showSystemDropdown={showSystemDropdown}
        setShowSystemDropdown={setShowSystemDropdown}
        connectingSystemId={connectingSystemId}
        tiles={tiles}
        normalizeSystemId={normalizeSystemId}
        handleSystemSelect={handleSystemSelect}
        onDisconnect={handleDisconnectSystem}
        activeSession={effectiveSession}
        setActiveSession={setActiveSession}
      />

      <ChatScreen
        isConnected={isConnected}
        userName={userName}
        systemList={systemList}
        tiles={tiles}
        onAddNewSystem={() => onOpenSapLogin?.(null)}
        onReconnectSystem={handleReconnectSuggestion}
        statusText={statusText}
        normalizeSystemId={normalizeSystemId}
        handleSystemSelect={handleSystemSelect}
        showSystemDropdown={showSystemDropdown}
        setShowSystemDropdown={setShowSystemDropdown}
        connectingSystemId={connectingSystemId}
        messagesElRef={messagesElRef}
        onMessagesScrollInternal={onMessagesScrollInternal}
        activeConv={activeConv}
        activeSession={effectiveSession}
        msgLoadingMore={msgLoadingMore}
        editingIndex={editingIndex}
        editingText={editingText}
        setEditingText={setEditingText}
        startEditMessage={startEditMessage}
        cancelEdit={cancelEdit}
        applyEditLocal={applyEditLocal}
        onSend={handleSuggestionSend}
        pendingAction={pendingAction}
        onCopyAssistant={onCopyAssistant}
        copiedAtIndex={copiedAtIndex}
        loading={loading}
        bottomRef={bottomRef}
        showScrollDown={showScrollDown}
        inlineForm={isConnected ? solmanCreateCrForm : null}
      />

      {isConnected && (
        <footer className="sticky bottom-0 bg-white px-4 py-3 border-t border-gray-200 flex-shrink-0">
          <div className="mx-auto max-w-4xl">
            <div className="rounded-2xl border border-gray-300 bg-gray-100 p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!canInteract) return;
                  if (loading) return;
                  if (!String(input || "").trim()) return;
                  onSend?.(
                    buildSendPayload({
                      overrideText: input,
                      displayText: input,
                      sessionId: resolvedSessionId,
                    })
                  );
                }}
              >
                <div className="flex items-end gap-2">
                  <button
                    type="button"
                    onClick={onMicClick}
                    disabled={!canInteract}
                    className={classNames(
                      "rounded-xl px-3 py-2 border transition flex items-center justify-center",
                      listening
                        ? "bg-rose-600 text-white border-rose-500 hover:bg-rose-700"
                        : "bg-white text-zinc-700 border-gray-300 hover:bg-gray-200",
                      !canInteract && "opacity-50 cursor-not-allowed"
                    )}
                    title={listening ? "Stop microphone" : "Start microphone"}
                  >
                    {listening ? (
                      <FiMicOff className="text-lg" />
                    ) : (
                      <FiMic className="text-lg" />
                    )}
                  </button>

                  <textarea
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={onComposerKeyDown}
                    rows={2}
                    placeholder={canInteract ? "Start type a message… " : "Click Connect to start chatting…"}
                    disabled={!canInteract}
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
                      disabled={!canInteract || !String(input || "").trim()}
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
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSpeechToText } from "../hooks/useSpeechToText";
import { sendChatMessageStream } from "../api/chatApiStream";
import { getSolmanChangeRequestDetails } from "../api/solmanApi";

import Sidebar from "./Sidebar";
import ChatWindow from "./ChatWindow";
import SapLogin from "../pages/saplogin";
import { authFetch } from "../api/authFetch";
import SolmanCreateCrForm from "./SolmanCreateCrForm";

//---------------------------------------------//
// Utility helpers
//---------------------------------------------//

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
  if (!v || !v.systemId) return null;
  return {
    systemId: normalizeSystemId(v.systemId),
    sapUser: String(v.sapUser || "").trim() || null,
    firstName: String(v.firstName || "").trim(),
    fullName: String(v.fullName || "").trim(),
  };
}

function buildAvailableSystemsFromTiles(tiles = []) {
  if (!Array.isArray(tiles)) return [];

  return tiles
    .map((tile) => {
      const system = tile?.system && typeof tile.system === "object" ? tile.system : {};

      const systemId = String(
        tile?.systemId ||
          tile?.SystemId ||
          system?.systemId ||
          system?.SystemId ||
          tile?.code ||
          system?.code ||
          ""
      )
        .trim()
        .toUpperCase();

      if (!systemId) return null;

      const name = String(
        tile?.name ||
          tile?.systemName ||
          tile?.title ||
          system?.name ||
          system?.systemName ||
          systemId
      ).trim();

      const host = String(
        tile?.host ||
          tile?.Host ||
          system?.host ||
          system?.Host ||
          ""
      )
        .trim()
        .toLowerCase();

      const rawPort =
        tile?.port ??
        tile?.Port ??
        system?.port ??
        system?.Port ??
        "";

      const port = String(rawPort).trim();

      const protocol = String(
        tile?.protocol ||
          tile?.Protocol ||
          system?.protocol ||
          system?.Protocol ||
          "https"
      )
        .trim()
        .toLowerCase();

      const connected =
        tile?.connected === true ||
        tile?.isConnected === true ||
        system?.connected === true ||
        system?.isConnected === true ||
        tile?.status === "connected" ||
        system?.status === "connected" ||
        tile?.active === true ||
        system?.active === true;

      const aliases = Array.isArray(tile?.aliases)
        ? tile.aliases.map((a) => String(a || "").trim()).filter(Boolean)
        : [];

      return {
        systemId,
        name,
        host,
        port,
        protocol,
        connected,
        isConnected: connected,
        status: connected ? "connected" : "disconnected",
        aliases,
        sapUser:
          tile?.sapUser ||
          system?.sapUser ||
          tile?.user ||
          system?.user ||
          "",
      };
    })
    .filter((item) => item && (item.systemId || (item.host && item.port)));
}

function getCurrentConnectedSystem({ activeSession, selectedSystem, availableSystems }) {
  const activeId = normalizeSystemId(activeSession?.systemId);
  const selectedId = normalizeSystemId(selectedSystem?.systemId);
  const activeSapUser = String(activeSession?.sapUser || "").trim();

  if (activeId && activeSapUser) {
    return {
      systemId: activeId,
      sapUser: activeSapUser,
    };
  }

  const activeMatch = activeId
    ? availableSystems.find(
        (item) =>
          normalizeSystemId(item?.systemId) === activeId &&
          item?.connected === true
      )
    : null;

  if (activeMatch) {
    return {
      systemId: activeId,
      sapUser: String(activeSession?.sapUser || activeMatch?.sapUser || "").trim(),
    };
  }

  const selectedMatch = selectedId
    ? availableSystems.find(
        (item) =>
          normalizeSystemId(item?.systemId) === selectedId &&
          item?.connected === true
      )
    : null;

  if (selectedMatch) {
    return {
      systemId: selectedId,
      sapUser: String(selectedMatch?.sapUser || activeSession?.sapUser || "").trim(),
    };
  }

  return {
    systemId: "",
    sapUser: "",
  };
}

//---------------------------------------------//
// Main component
//---------------------------------------------//

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
  const [pendingAction, setPendingAction] = useState(null);

  const [activeSession, setActiveSession] = useState(() => {
    try {
      return normalizeActiveSession(JSON.parse(localStorage.getItem("sapActiveSession") || "null"));
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (activeSession) {
      localStorage.setItem("sapActiveSession", JSON.stringify(activeSession));
    } else {
      localStorage.removeItem("sapActiveSession");
    }
  }, [activeSession]);

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

      const normalized = items.map((tile) => {
        const connected =
          tile?.connected === true ||
          tile?.isConnected === true ||
          tile?.status === "connected" ||
          tile?.active === true;

        return {
          ...tile,
          systemId: normalizeSystemId(tile?.systemId || tile?.SystemId || ""),
          connected,
          isConnected: connected,
          status: connected ? "connected" : "disconnected",
          active: connected,
        };
      });

      setTiles(normalized);
    } catch {
    } finally {
      setTilesLoaded(true);
    }
  }, [apiBase]);

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
      loadSystems();
      loadTiles();
    }

    function onSapConnectionChanged() {
      syncActiveSessionFromStorage();
      loadSystems();
      loadTiles();
    }

    window.addEventListener("storage", onStorage);
    window.addEventListener("sapActiveSessionChanged", onSapSessionChanged);
    window.addEventListener("sapConnectionChanged", onSapConnectionChanged);

    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("sapActiveSessionChanged", onSapSessionChanged);
      window.removeEventListener("sapConnectionChanged", onSapConnectionChanged);
    };
  }, [loadSystems, loadTiles]);

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

  useEffect(() => {
    if (!Array.isArray(tiles) || tiles.length === 0) {
      if (activeSession?.systemId) {
        setSelectedSystem(null);
      }
      return;
    }

    const isTileConnected = (t) =>
      t?.connected === true ||
      t?.isConnected === true ||
      t?.status === "connected" ||
      t?.active === true;

    if (activeSession?.systemId) {
      const matchedTile = tiles.find(
        (t) =>
          normalizeSystemId(t?.systemId || t?.SystemId || t?.name) ===
          normalizeSystemId(activeSession.systemId)
      );

      if (!matchedTile) {
        setSelectedSystem(null);
        setActiveSession(null);
        localStorage.removeItem("sapActiveSession");
        window.dispatchEvent(new Event("sapActiveSessionChanged"));
        return;
      }

      if (!isTileConnected(matchedTile)) {
        setSelectedSystem(matchedTile);
        setActiveSession(null);
        localStorage.removeItem("sapActiveSession");
        window.dispatchEvent(new Event("sapActiveSessionChanged"));
        return;
      }

      setSelectedSystem(matchedTile);

      const nextSapUser = String(
        matchedTile?.sapUser || activeSession?.sapUser || ""
      ).trim();

      const nextSession = normalizeActiveSession({
        ...activeSession,
        systemId: matchedTile.systemId,
        sapUser: nextSapUser,
      });

      const prevKey = JSON.stringify(activeSession || null);
      const nextKey = JSON.stringify(nextSession || null);

      if (nextSession && prevKey !== nextKey) {
        setActiveSession(nextSession);
      }

      return;
    }

    const connectedSelected = selectedSystem?.systemId
      ? tiles.find(
          (t) =>
            normalizeSystemId(t?.systemId || t?.SystemId || t?.name) ===
              normalizeSystemId(selectedSystem.systemId) && isTileConnected(t)
        )
      : null;

    if (connectedSelected) {
      setSelectedSystem(connectedSelected);
    }
  }, [tiles, activeSession, selectedSystem]);

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
  const sendingRef = useRef(false);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);

  const baseRef = useRef("");
  const interimRef = useRef("");
  const cursorRef = useRef(null);

  const activeConv = useMemo(() => {
    const found = conversations.find((c) => c.id === activeId);
    if (found) return found;

    if (isMongoId(activeId)) {
      return { id: activeId, title: "New chat", messages: [], updatedAt: Date.now() };
    }

    return conversations[0] || null;
  }, [conversations, activeId]);

  const availableSystems = useMemo(() => {
    return buildAvailableSystemsFromTiles(tiles);
  }, [tiles]);

  const hasConnectedSystems = useMemo(() => {
    return availableSystems.some((item) => item?.connected === true);
  }, [availableSystems]);

  const canSendMessage = useMemo(() => {
    const optimisticActiveId = normalizeSystemId(activeSession?.systemId);
    const optimisticSapUser = String(activeSession?.sapUser || "").trim();

    if (optimisticActiveId && optimisticSapUser) {
      return true;
    }

    if (hasConnectedSystems) return true;

    if (activeSession?.systemId) {
      const matchedActive = availableSystems.find(
        (item) => item.systemId === normalizeSystemId(activeSession.systemId)
      );
      if (matchedActive?.connected) return true;
    }

    if (selectedSystem?.systemId) {
      const matchedSelected = availableSystems.find(
        (item) => item.systemId === normalizeSystemId(selectedSystem.systemId)
      );
      if (matchedSelected?.connected) return true;
    }

    try {
      const stored = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
      const sid = normalizeSystemId(stored?.systemId || "");
      if (sid) {
        const matched = availableSystems.find((item) => item.systemId === sid);
        if (matched?.connected) return true;
      }
    } catch {}

    return false;
  }, [
    hasConnectedSystems,
    availableSystems,
    activeSession?.systemId,
    activeSession?.sapUser,
    selectedSystem?.systemId,
  ]);

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

  const onStop = useCallback(() => {
    try {
      abortRef.current?.abort();
    } catch {}
  }, []);

  function focusInput() {
    setTimeout(() => inputRef.current?.focus(), 0);
  }

  function updateConversationById(convId, updater) {
    setConversations((prev) =>
      prev.map((c) => {
        if (String(c.id) !== String(convId)) return c;
        const messages = typeof updater === "function" ? updater(c.messages) : updater;
        return { ...c, messages, updatedAt: Date.now() };
      })
    );
  }

  function updateActiveMessages(updater) {
    updateConversationById(activeId, updater);
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
    setPendingAction(null);

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
        return prev.map((c) => {
          if (c.id !== "draft") return c;

          const nextTitle =
            c.title && c.title !== "New chat" ? c.title : title;

          return { ...c, id: sessionId, title: nextTitle, updatedAt: Date.now() };
        });
      }

      return [{ id: sessionId, title, messages: [], updatedAt: Date.now() }, ...prev];
    });
  }, []);

  async function onSend({
    overrideText,
    displayText = "",
    fromEdit = false,
    forcedSystemId = null,
    businessScope = "",
    pendingContext = null,
    sessionId = null,
  } = {}) {
    const requestText =
      typeof overrideText === "string"
        ? overrideText
        : typeof input === "string"
          ? input
          : "";

    const text = requestText.trim();
    const uiText = String(displayText || text).trim();

    if (!text || loading) return;
    if (sendingRef.current) return;

    const explicitSystemId = String(forcedSystemId || "")
      .trim()
      .toUpperCase();

    const optimisticActiveId = normalizeSystemId(activeSession?.systemId);
    const optimisticSapUser = String(activeSession?.sapUser || "").trim();

    const isSystemConnectedNow = (sid) => {
      const normalizedSid = normalizeSystemId(sid);
      if (!normalizedSid) return false;

      if (optimisticActiveId === normalizedSid && optimisticSapUser) {
        return true;
      }

      const matched = availableSystems.find(
        (item) => normalizeSystemId(item?.systemId) === normalizedSid
      );

      return matched?.connected === true;
    };

    const matchedRequestedSystem = explicitSystemId
      ? availableSystems.find(
          (item) => String(item?.systemId || "").trim().toUpperCase() === explicitSystemId
        ) || null
      : null;

    const currentConnected = getCurrentConnectedSystem({
      activeSession,
      selectedSystem,
      availableSystems,
    });

    const fallbackConnectedSystemId = currentConnected.systemId || null;
    const fallbackSapUser = currentConnected.sapUser || "";

    const safeExplicitSystemId =
      explicitSystemId &&
      isSystemConnectedNow(explicitSystemId)
        ? explicitSystemId
        : "";

    const effectiveAvailableSystems = (() => {
      if (!optimisticActiveId || !optimisticSapUser) return availableSystems;

      const hasOptimisticSystem = availableSystems.some(
        (item) => normalizeSystemId(item?.systemId) === optimisticActiveId
      );

      if (!hasOptimisticSystem) {
        return [
          ...availableSystems,
          {
            systemId: optimisticActiveId,
            sapUser: optimisticSapUser,
            connected: true,
            isConnected: true,
            status: "connected",
          },
        ];
      }

      return availableSystems.map((item) => {
        if (normalizeSystemId(item?.systemId) !== optimisticActiveId) return item;

        return {
          ...item,
          sapUser: optimisticSapUser || item?.sapUser || "",
          connected: true,
          isConnected: true,
          status: "connected",
        };
      });
    })();

    const requestAvailableSystems = safeExplicitSystemId
      ? effectiveAvailableSystems.filter(
          (item) => String(item?.systemId || "").trim().toUpperCase() === safeExplicitSystemId
        )
      : effectiveAvailableSystems;

    sendingRef.current = true;
    baseRef.current = "";
    interimRef.current = "";

    const currentConvId = activeId;
    const sessionIdToSend = isMongoId(sessionId)
      ? sessionId
      : isMongoId(currentConvId)
        ? currentConvId
        : null;

    const upperText = String(text || "").trim().toUpperCase();
    const isFollowupChoice = upperText === "ROW" || upperText === "INDIA";
    const isPendingFollowup = Boolean(pendingContext || pendingAction);

    if (!fromEdit) {
      updateConversationById(currentConvId, (m) => [...m, { role: "user", text: uiText }]);

      setConversations((prev) =>
        prev.map((c) => {
          if (c.id !== currentConvId) return c;

          if (isFollowupChoice || isPendingFollowup) {
            return c;
          }

          if (c.title === "New chat" || c.title === "SAP MM Chat") {
            return { ...c, title: generateTitle(text) };
          }

          return c;
        })
      );
    }

    setInput("");
    setLoading(true);

    setTimeout(() => inputRef.current?.blur(), 50);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const isNextQuery = /\b(next|more|another|load|show\s+more)\b/i.test(text);
      if (!isNextQuery) cursorRef.current = null;

      setStatusText("Interpreting your query...");

      let streamedPayload = null;

      await sendChatMessageStream(text, {
        apiBase,
        systemId: safeExplicitSystemId || fallbackConnectedSystemId || null,
        sapUser: fallbackSapUser || null,
        sessionId: sessionIdToSend,
        availableSystems:
          requestAvailableSystems.length > 0 ? requestAvailableSystems : effectiveAvailableSystems,
        cursor: isNextQuery ? cursorRef.current : null,
        businessScope: businessScope || "",
        pendingAction: pendingContext || pendingAction || null,
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

      const assistantText = String(
        data?.reply ?? data?.text ?? data?.message ?? ""
      ).trim() || "I didn't understand your request. Could you please rephrase it?";

      setPendingAction(null);

      const targetConvId =
        data?.sessionId && isMongoId(data.sessionId) ? data.sessionId : currentConvId;

      if (data?.sessionId && isMongoId(data.sessionId)) {
        if (currentConvId === "draft") {
          ensureSessionExistsLocally(data.sessionId, text);

          if (!isFollowupChoice && !isPendingFollowup) {
            const newTitle = generateTitle(text);
            authFetch(`${apiBase}/chat/sessions/${data.sessionId}`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ title: newTitle }),
            }).catch(() => {});
          }
        }

        setActiveId(data.sessionId);
        window.dispatchEvent(new Event("chatSessionsChanged"));
      }

      updateConversationById(targetConvId, (m) => [
        ...m,
        {
          role: "assistant",
          text: assistantText,
          suggestions: data.suggestions,
          summary: data.summary || "",
          summaryStatus: data.summary ? "done" : "pending",
          data: data.data || null,
          pagination: data.pagination || null,
        },
      ]);

      cursorRef.current = data?.cursor || null;
    } catch (e) {
      const payload = e?.payload || null;
      const payloadSessionId = isMongoId(payload?.sessionId) ? payload.sessionId : null;
      const errorConvId = payloadSessionId || currentConvId;

      if (payloadSessionId && currentConvId === "draft") {
        ensureSessionExistsLocally(payloadSessionId, text);
        setActiveId(payloadSessionId);
        window.dispatchEvent(new Event("chatSessionsChanged"));
      }

      if (
        payload?.action?.type === "open_form" &&
        payload?.action?.formId === "solman_create_cr"
      ) {
        setPendingAction(payload?.pendingAction || null);
        setShowSolmanCrForm(true);

        updateConversationById(errorConvId, (m) => [
          ...m,
          {
            role: "assistant",
            text: payload?.message || "Please complete the required change request details.",
          },
        ]);
      } else if (payload?.action?.type === "add_system") {
        updateConversationById(errorConvId, (m) => [
          ...m,
          {
            role: "assistant",
            text:
              payload?.message ||
              "This system isn’t added yet. Please add it to continue.",
            suggestions: [payload?.action?.label || "Add System"],
            action: payload?.action || null,
          },
        ]);
      } else if (
        payload?.status === "needs_input" &&
        Array.isArray(payload?.missingFields) &&
        payload.missingFields.includes("processType")
      ) {
        setPendingAction(payload?.pendingAction || null);

        const options = Array.isArray(payload?.action?.options)
          ? payload.action.options.map((x) => x?.label || x?.value).filter(Boolean)
          : ["ROW", "INDIA"];

        updateConversationById(errorConvId, (m) => [
          ...m,
          {
            role: "assistant",
            text:
              payload?.message ||
              "Which landscape would you like to view the Change Requests from?",
            suggestions: options,
            pendingAction: payload?.pendingAction || null,
          },
        ]);
      } else if (
        payload?.status === "needs_input" &&
        Array.isArray(payload?.missingFields) &&
        payload.missingFields.includes("systemId")
      ) {
        const candidates = Array.isArray(payload?.systemResolution?.candidates)
          ? payload.systemResolution.candidates
          : [];

        updateConversationById(errorConvId, (m) => [
          ...m,
          {
            role: "assistant",
            text: payload?.message || "Please specify which system to use.",
            ...(candidates.length > 0
              ? {
                  suggestions: candidates.map((id) => `Use ${id}`),
                }
              : {}),
          },
        ]);
      } else if (payload?.status === "disconnected_system") {
        const targetSystemId = String(
          payload?.action?.systemId || payload?.systemResolution?.targetSystemId || ""
        )
          .trim()
          .toUpperCase();

        const reconnectAction = {
          type: "reconnect_system",
          systemId: targetSystemId || null,
          label: targetSystemId ? `Connect ${targetSystemId}` : "Connect system",
        };

        updateConversationById(errorConvId, (m) => [
          ...m,
          {
            role: "assistant",
            text:
              payload?.message ||
              `The requested system${
                payload?.systemResolution?.targetSystemId
                  ? ` ${payload.systemResolution.targetSystemId}`
                  : ""
              } is disconnected. Please connect that system and try again.`,
            suggestions: [
              {
                label: reconnectAction.label,
                action: reconnectAction,
              },
            ],
            action: reconnectAction,
          },
        ]);
      } else {
        updateConversationById(errorConvId, (m) => [
          ...m,
          { role: "assistant", text: `Error: ${e.message}` },
        ]);
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
      if (!canSendMessage) return;
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

    if (!canSendMessage) return;

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

  async function handleViewCrStatus({ objectId, processType = "YMHF" }) {
    if (!activeSession?.systemId) {
      updateActiveMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Cannot fetch CR status because no active SAP system is selected.",
        },
      ]);
      return;
    }

    if (!activeSession?.sapUser) {
      updateActiveMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "Cannot fetch CR status because no active SAP user is available.",
        },
      ]);
      return;
    }

    try {
      const data = await getSolmanChangeRequestDetails({
        systemId: activeSession.systemId,
        sapUser: activeSession.sapUser,
        objectId,
        processType,
      });

      const item = data?.result?.results?.[0];

      if (!item) {
        updateActiveMessages((m) => [
          ...m,
          {
            role: "assistant",
            text: `No details found for CR ${objectId}.`,
          },
        ]);
        return;
      }

      updateActiveMessages((m) => [
        ...m,
        {
          role: "assistant",
          text:
            `CR ${item.OBJECT_ID}\n` +
            `Short Description: ${item.SHORT_DESC || "-"}\n` +
            `Status: ${item.STATUS || "-"}\n` +
            `Priority: ${item.PRIORITY || "-"}\n` +
            `Created On: ${item.CREATED_ON || "-"}\n` +
            `Last Changed By: ${item.LAST_CHANGED_BY || "-"}\n` +
            `Last Changed At: ${item.LAST_CHANGED_AT || "-"}\n` +
            `Category: ${item.CATEGORY || "-"}`,
        },
      ]);
    } catch (err) {
      updateActiveMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: err?.message || "Failed to fetch change request details.",
        },
      ]);
    }
  }

  const handleConnectedFromSapLogin = async (payload) => {
    try {
      localStorage.removeItem("forceSapLogin");
    } catch {}

    const sid = normalizeSystemId(payload?.systemId || payload?.system?.systemId);
    const sapUser = String(payload?.sapUser || payload?.system?.sapUser || "").trim();

    if (sid) {
      const next = normalizeActiveSession({
        systemId: sid,
        sapUser,
        firstName: payload?.firstName,
        fullName: payload?.fullName,
      });

      setActiveSession(next);
      setSelectedSystem({
        systemId: sid,
        sapUser,
        name: payload?.system?.name || sid,
        connected: true,
        isConnected: true,
        status: "connected",
        active: true,
      });

      localStorage.setItem("sapActiveSession", JSON.stringify(next));
      window.dispatchEvent(new Event("sapActiveSessionChanged"));
    }

    await loadTiles();
    await loadSystems();

    setSapView("chat");
  };

  const handleDisconnect = async (system = null) => {
    try {
      const sid = normalizeSystemId(
        system?.systemId ||
        activeSession?.systemId ||
        selectedSystem?.systemId
      );

      setActiveSession(null);
      setSelectedSystem(null);
      setShowSolmanCrForm(false);
      setPendingAction(null);

      localStorage.removeItem("sapActiveSession");
      localStorage.removeItem("sapConnected");
      window.dispatchEvent(new Event("sapActiveSessionChanged"));

      await authFetch(`${apiBase}/sap/disconnect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(sid ? { systemId: sid } : {}),
      }).catch(() => {});
    } finally {
      await loadTiles();
      await loadSystems();
    }
  };

  const openSapLogin = (system = null) => {
    try {
      localStorage.removeItem("forceSapLogin");
    } catch {}

    setSelectedSystem(system);
    setSapView("saplogin");
    setShowSolmanCrForm(false);
    setPendingAction(null);
  };

  const handleSystemSelect = useCallback((system) => {
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
  }, []);

  const solmanCreateCrForm = showSolmanCrForm ? (
    <div className="px-4 pb-4">
      <SolmanCreateCrForm
        systemId={activeSession?.systemId || ""}
        sapUser={activeSession?.sapUser || ""}
        initialValues={pendingAction?.collected || {}}
        pendingAction={pendingAction}
        onCancel={() => {
          setShowSolmanCrForm(false);
        }}
        onSuccess={async (data) => {
          const crId = data.changeRequestId;

          setShowSolmanCrForm(false);
          setPendingAction(null);

          updateActiveMessages((m) => [
            ...m,
            {
              role: "assistant",
              text: `CR ${crId} created successfully. Status: ${data.status}`,
            },
          ]);

          await handleViewCrStatus({
            objectId: crId,
            processType: "YMHF",
          });
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
            sessionId={isMongoId(activeConv?.id) ? activeConv.id : null}
            editingIndex={editingIndex}
            editingText={editingText}
            statusText={statusText}
            copiedAtIndex={copiedAtIndex}
            bottomRef={bottomRef}
            inputRef={inputRef}
            setSidebarOpen={setSidebarOpen}
            setInput={setInput}
            onSend={onSend}
            pendingAction={pendingAction}
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
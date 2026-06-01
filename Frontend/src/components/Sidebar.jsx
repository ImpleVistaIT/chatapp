import close from "../assets/close.png";
import logoFull from "../assets/ImplevistaLogo.png";
import logoSmall from "../assets/Vlogo.png";
import sidebaropen from "../assets/sidebar.png";
import sidebarclose from "../assets/sidebar-close.png";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "react-hot-toast";
import { authFetch } from "../api/authFetch";

import CollapsedSidebar from "./sidebar/CollapsedSidebar.jsx";
import SystemsGrid from "./sidebar/SystemsGrid.jsx";
import UserMenu from "./sidebar/UserMenu.jsx";
import ChatHistorySection from "./sidebar/ChatHistorySection.jsx";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

function Sidebar({
  sidebarOpen = false,
  collapsed = false,
  activeId = null,
  conversations = [],

  editingChatId = null,
  editingTitle = "",
  menuOpenId = null,
  setSidebarOpen = () => {},
  setCollapsed = () => {},
  setMenuOpenId = () => {},
  setEditingChatId = () => {},
  setEditingTitle = () => {},
  cancelRename = () => {},
  onNewChat = () => {},
  setActiveId = () => {},
  userName = "User",

  onAddNewSystem = () => {},
  onOpenSapLogin = () => {},
  onSystemsChanged = null,

  handleDelete = null,
  activeSession = null,
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showCollapseBtn, setShowCollapseBtn] = useState(false);
  const [showSystemDetails, setShowSystemDetails] = useState(false);

  const menuRef = useRef(null);
  const chatMenuRef = useRef(null);
  const logoRef = useRef(null);

  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  const [tiles, setTiles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionsNextBefore, setSessionsNextBefore] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsHasMore, setSessionsHasMore] = useState(true);

  const sessionsLoadingRef = useRef(false);
  const sessionsHasMoreRef = useRef(true);

  const [activeSystemData, setActiveSystemData] = useState(null);
  const [connectingSid, setConnectingSid] = useState(null);

  const normalizeSid = (sid) => String(sid || "").trim().toUpperCase();
  const normalizeSapUser = (u) => String(u || "").trim().toUpperCase();

  const loadActiveSystem = useCallback(() => {
    try {
      const s = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
      setActiveSystemData(s || null);
    } catch {
      setActiveSystemData(null);
    }
  }, []);

  useEffect(() => {
    loadActiveSystem();
  }, [loadActiveSystem]);

  const fetchTiles = useCallback(async () => {
    try {
      const res = await authFetch(`${apiBase}/sap/tiles`, { method: "GET" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) {
        throw new Error(payload?.error || `Failed to load tiles (${res.status})`);
      }

      const items = Array.isArray(payload.items) ? payload.items : [];

      const mapped = items
        .map((t, i) => {
          const connected =
            t?.connected === true ||
            t?.isConnected === true ||
            t?.status === "connected" ||
            t?.active === true;

          return {
            ...t,
            _id: t?._id || t?.id || t?.systemId || `sys-${i}`,
            systemId: normalizeSid(t?.systemId || t?.name),
            name:
              t?.name ||
              t?.system?.name ||
              t?.description ||
              normalizeSid(t?.systemId || t?.name),
            protocol: t?.protocol || t?.system?.protocol || "https",
            host: t?.host || t?.system?.host || "",
            port: t?.port ?? t?.system?.port ?? null,
            sapRouter: t?.sapRouter || t?.system?.sapRouter || "",
            sapUser: normalizeSapUser(t?.sapUser || ""),
            connected,
            isConnected: connected,
            status: connected ? "connected" : "disconnected",
            active: connected,
          };
        })
        .filter((x) => x.systemId);

      setTiles(mapped);
    } catch (e) {
      console.warn("Failed to load /sap/tiles:", e?.message || e);
      setTiles([]);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchTiles();
  }, [fetchTiles]);

  useEffect(() => {
    sessionsLoadingRef.current = sessionsLoading;
  }, [sessionsLoading]);

  useEffect(() => {
    sessionsHasMoreRef.current = sessionsHasMore;
  }, [sessionsHasMore]);

  const activeTile = useMemo(() => {
    const sid = normalizeSid(
      activeSystemData?.systemId ||
        activeSession?.systemId ||
        activeSystemData?.name ||
        ""
    );

    if (!sid) return null;

    return (tiles || []).find((t) => normalizeSid(t?.systemId || t?.name) === sid) || null;
  }, [activeSystemData, activeSession, tiles]);

  const displaySystems = useMemo(() => {
    return Array.isArray(tiles) ? tiles : [];
  }, [tiles]);

  const hasAnyConnectedSystems = useMemo(() => {
    return displaySystems.some((sys) => {
      const status = String(sys?.status || "").trim().toLowerCase();
      return (
        sys?.connected === true ||
        sys?.isConnected === true ||
        status === "connected" ||
        status === "online" ||
        status === "active" ||
        sys?.active === true
      );
    });
  }, [displaySystems]);

  const fetchSessions = useCallback(
    async ({ reset = false } = {}) => {
      if (sessionsLoadingRef.current) return;
      if (!reset && !sessionsHasMoreRef.current) return;

      if (!hasAnyConnectedSystems) {
        setSessions([]);
        setSessionsNextBefore(null);
        setSessionsHasMore(false);
        sessionsHasMoreRef.current = false;
        return;
      }

      sessionsLoadingRef.current = true;
      setSessionsLoading(true);
      try {
        const limit = 20;
        const before = reset ? null : sessionsNextBefore;

        const url = new URL(`${apiBase}/chat/sessions`);
        url.searchParams.set("limit", String(limit));
        if (before) url.searchParams.set("before", before);

        const res = await authFetch(url.toString(), { method: "GET" });
        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok !== true) {
          throw new Error(payload?.error || `Failed to load sessions (${res.status})`);
        }

        const items = Array.isArray(payload.items) ? payload.items : [];
        const nextBefore = payload.nextBefore || null;

        setSessions((prev) => {
          const base = reset ? [] : prev;
          const seen = new Set(base.map((s) => String(s._id)));
          const merged = [...base];

          for (const it of items) {
            const id = String(it?._id || "");
            if (!id || seen.has(id)) continue;
            seen.add(id);
            merged.push({
              _id: id,
              title: it.title || "New chat",
              createdAt: it.createdAt || null,
              updatedAt: it.updatedAt || null,
            });
          }

          merged.sort((a, b) => {
            const ad = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bd = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return bd - ad;
          });

          return merged;
        });

        setSessionsNextBefore(nextBefore);
        const hasMore = Boolean(nextBefore) && items.length > 0;
        setSessionsHasMore(hasMore);
        sessionsHasMoreRef.current = hasMore;
      } catch (e) {
        console.error("Failed to fetch sessions:", e);
      } finally {
        sessionsLoadingRef.current = false;
        setSessionsLoading(false);
      }
    },
    [
      apiBase,
      hasAnyConnectedSystems,
      sessionsNextBefore,
    ]
  );

  useEffect(() => {
    const onChatSessionsChanged = () => fetchSessions({ reset: true });
    window.addEventListener("chatSessionsChanged", onChatSessionsChanged);
    return () => window.removeEventListener("chatSessionsChanged", onChatSessionsChanged);
  }, [fetchSessions]);

  useEffect(() => {
    const onSapSessionChanged = () => {
      loadActiveSystem();
      fetchTiles();
    };

    window.addEventListener("sapActiveSessionChanged", onSapSessionChanged);
    return () => window.removeEventListener("sapActiveSessionChanged", onSapSessionChanged);
  }, [fetchTiles, loadActiveSystem]);

  const renameSessionApi = useCallback(
    async (id, title) => {
      const res = await authFetch(`${apiBase}/chat/sessions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || `Rename failed (${res.status})`);
      return payload;
    },
    [apiBase]
  );

  const deleteSessionApi = useCallback(
    async (id) => {
      const res = await authFetch(`${apiBase}/chat/sessions/${id}`, { method: "DELETE" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) throw new Error(payload?.error || `Delete failed (${res.status})`);
      return payload;
    },
    [apiBase]
  );

  useEffect(() => {
    if (!hasAnyConnectedSystems) {
      setSessions([]);
      setSessionsNextBefore(null);
      setSessionsHasMore(false);
      sessionsHasMoreRef.current = false;
      return;
    }

    setSessions([]);
    setSessionsNextBefore(null);
    setSessionsHasMore(true);
    sessionsHasMoreRef.current = true;
    fetchSessions({ reset: true });
  }, [hasAnyConnectedSystems]);

  useEffect(() => {
    const convArr = Array.isArray(conversations) ? conversations : [];

    const convSessions = convArr
      .map((c) => ({
        _id: String(c?._id || c?.id || ""),
        title: c?.title || "New chat",
        createdAt: c?.createdAt || null,
        updatedAt:
          typeof c?.updatedAt === "number"
            ? new Date(c.updatedAt).toISOString()
            : c?.updatedAt || null,
      }))
      .filter((s) => s._id && s._id !== "draft");

    if (convSessions.length === 0) return;

    setSessions((prev) => {
      const byId = new Map(prev.map((s) => [String(s._id), s]));

      for (const s of convSessions) {
        const id = String(s._id);
        const existing = byId.get(id);
        const title = existing?.title && existing.title !== "New chat" ? existing.title : s.title;

        byId.set(id, {
          _id: id,
          title,
          createdAt: existing?.createdAt || s.createdAt || null,
          updatedAt: s.updatedAt || existing?.updatedAt || null,
        });
      }

      const merged = Array.from(byId.values());
      merged.sort((a, b) => {
        const ad = a?.updatedAt ? new Date(a.updatedAt).getTime() : 0;
        const bd = b?.updatedAt ? new Date(b.updatedAt).getTime() : 0;
        return bd - ad;
      });
      return merged;
    });
  }, [conversations]);

  const onSessionsScroll = useCallback(
    (e) => {
      const el = e.target;
      if (el.scrollTop < 40) fetchSessions({ reset: false });
    },
    [fetchSessions]
  );

  useEffect(() => {
    function onOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) setUserMenuOpen(false);
    }
    document.addEventListener("mousedown", onOutside);
    return () => document.removeEventListener("mousedown", onOutside);
  }, []);

  useEffect(() => {
    function onOutsideChatMenu(e) {
      if (chatMenuRef.current && !chatMenuRef.current.contains(e.target)) setMenuOpenId(null);
    }
    document.addEventListener("mousedown", onOutsideChatMenu);
    return () => document.removeEventListener("mousedown", onOutsideChatMenu);
  }, [setMenuOpenId]);

  const onNewChatWithToast = useCallback(() => {
    onNewChat?.();
    toast.success("New chat created");
  }, [onNewChat]);

  const setActiveSystemLocal = useCallback(
    async (sys) => {
      const sid = normalizeSid(sys?.systemId || sys?.name);
      if (!sid) return;

      const label = sys?.name || sys?.description || sid;

      const nextActiveSystem = {
        systemId: sid,
        name: label,
        protocol: sys?.protocol || "https",
        host: sys?.host || "",
        port: sys?.port ?? null,
        sapRouter: sys?.sapRouter || "",
      };

      localStorage.setItem("sapActiveSystem", JSON.stringify(nextActiveSystem));
      setActiveSystemData(nextActiveSystem);

      localStorage.removeItem("chatSessionId");
      setActiveId?.("draft");
      onNewChat?.();

      setConnectingSid(sid);

      setTiles((prev) =>
        (Array.isArray(prev) ? prev : []).map((t) =>
          normalizeSid(t?.systemId) === sid
            ? {
                ...t,
                connected: false,
                isConnected: false,
                status: "connecting",
                active: false,
              }
            : t
        )
      );

      const toastId = toast.loading(`Connecting to ${label}...`);

      try {
        const connRes = await authFetch(`${apiBase}/sap/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemId: sid,
            validate: true,
          }),
        });

        const connPayload = await connRes.json().catch(() => ({}));
        if (!connRes.ok || connPayload?.ok !== true) {
          throw new Error(connPayload?.error || `Connect failed (${connRes.status})`);
        }

        const connectedSapUser = normalizeSapUser(connPayload?.sapUser || "");

        const updatedActive = {
          ...nextActiveSystem,
          sapUser: connectedSapUser || null,
        };

        localStorage.setItem("sapActiveSystem", JSON.stringify(updatedActive));
        setActiveSystemData(updatedActive);

        localStorage.setItem(
          "sapActiveSession",
          JSON.stringify({
            systemId: sid,
            sapUser: connectedSapUser || null,
            firstName: String(connPayload?.firstName || "").trim(),
            fullName: String(connPayload?.fullName || "").trim(),
          })
        );

        await fetchTiles();
        window.dispatchEvent(new Event("sapActiveSessionChanged"));
        window.dispatchEvent(new Event("sapConnectionChanged"));

        if (typeof onSystemsChanged === "function") {
          await onSystemsChanged();
        }

        toast.success(`Connected to ${label}`, { id: toastId });
      } catch (e) {
        console.error("Connect failed:", e);

        setTiles((prev) =>
          (Array.isArray(prev) ? prev : []).map((t) =>
            normalizeSid(t?.systemId) === sid
              ? {
                  ...t,
                  connected: false,
                  isConnected: false,
                  status: "disconnected",
                  active: false,
                }
              : t
          )
        );

        toast.error(e?.message || "Connect failed. Please login again.", { id: toastId });
        onOpenSapLogin?.(sys);
      } finally {
        setConnectingSid(null);
      }
    },
    [apiBase, fetchTiles, onNewChat, onOpenSapLogin, onSystemsChanged, setActiveId]
  );

  const disconnectSystem = useCallback(
    async (sys) => {
      const sid = normalizeSid(sys?.systemId || sys?.name);
      if (!sid) {
        toast.error("No system selected.");
        return;
      }

      const label = sys?.name || sys?.description || sid;
      const ok = window.confirm(`Disconnect ${label}?`);
      if (!ok) return;

      const toastId = toast.loading(`Disconnecting ${label}...`);

      try {
        const res = await authFetch(`${apiBase}/sap/disconnect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemId: sid }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok !== true) {
          throw new Error(payload?.error || `Disconnect failed (${res.status})`);
        }

        if (normalizeSid(activeSystemData?.systemId || activeSystemData?.name) === sid) {
          localStorage.removeItem("sapActiveSystem");
          localStorage.removeItem("chatSessionId");
          localStorage.removeItem("sapActiveSession");
          setActiveSystemData(null);
          setActiveId?.("draft");
          onNewChat?.();
        }

        await fetchTiles();
        window.dispatchEvent(new Event("sapActiveSessionChanged"));
        toast.success(`Disconnected ${label}`, { id: toastId });

        if (typeof onSystemsChanged === "function") {
          onSystemsChanged();
        }

        await fetchSessions({ reset: true });
      } catch (e) {
        console.error("Disconnect failed:", e);
        toast.error(e?.message || "Failed to disconnect system.", { id: toastId });
      } finally {
        setUserMenuOpen(false);
        setShowSystemDetails(false);
      }
    },
    [
      activeSystemData?.name,
      activeSystemData?.systemId,
      apiBase,
      fetchSessions,
      fetchTiles,
      onNewChat,
      onSystemsChanged,
      setActiveId,
    ]
  );

  const removeSystem = useCallback(
    async (sys) => {
      const targetSystem = sys || activeSystemData;
      const sid = normalizeSid(targetSystem?.systemId || targetSystem?.name);

      if (!sid) {
        toast.error("No system selected.");
        return;
      }

      const label = targetSystem?.name || targetSystem?.description || sid;
      const ok = window.confirm(
        `Remove ${label}? This will delete the system and related records.`
      );
      if (!ok) return;

      const toastId = toast.loading(`Removing ${label}...`);

      try {
        const res = await authFetch(`${apiBase}/sap/systems/${encodeURIComponent(sid)}`, {
          method: "DELETE",
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok !== true) {
          throw new Error(payload?.error || `Remove failed (${res.status})`);
        }

        setTiles((prev) =>
          (Array.isArray(prev) ? prev : []).filter(
            (t) => normalizeSid(t?.systemId || t?.name) !== sid
          )
        );

        if (normalizeSid(activeSystemData?.systemId || activeSystemData?.name) === sid) {
          localStorage.removeItem("sapActiveSystem");
          localStorage.removeItem("sapActiveSession");
          localStorage.removeItem("chatSessionId");
          setActiveSystemData(null);
          setActiveId?.("draft");
          onNewChat?.();
        }

        window.dispatchEvent(new Event("sapActiveSessionChanged"));
        toast.success(`${label} removed`, { id: toastId });

        if (typeof onSystemsChanged === "function") {
          onSystemsChanged();
        }

        await fetchSessions({ reset: true });
      } catch (e) {
        console.error("Remove failed:", e);
        toast.error(e?.message || "Failed to remove system.", { id: toastId });
      } finally {
        setUserMenuOpen(false);
        setShowSystemDetails(false);
      }
    },
    [
      activeSystemData?.name,
      activeSystemData?.systemId,
      apiBase,
      fetchSessions,
      onNewChat,
      onSystemsChanged,
      setActiveId,
    ]
  );

  return (
    <>
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close sidebar"
          onClick={() => setSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-black/30 md:hidden"
        />
      )}

      <aside
        className={classNames(
          "z-50 flex flex-col border-r border-gray-200 bg-[#f3f4f6]",
          "fixed inset-y-0 left-0 md:static",
          "transform transition-all duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
          collapsed ? "w-16" : "w-72"
        )}
      >
        <div className={classNames("flex items-center justify-between flex-shrink-0", collapsed ? "px-2 py-3" : "px-3 py-2")}>
          {collapsed ? (
            <div
              ref={logoRef}
              className="relative group/logo flex items-center justify-center flex-1"
              onMouseEnter={() => setShowCollapseBtn(true)}
              onMouseLeave={() => setShowCollapseBtn(false)}
            >
              <img src={logoSmall} alt="logo" className="h-9 w-9 object-contain transition-all duration-300" />
              {showCollapseBtn && (
                <button
                  onClick={() => setCollapsed(false)}
                  title="Expand sidebar"
                  className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/20 hover:bg-gray-300 transition-all duration-150"
                  type="button"
                >
                  <img src={sidebaropen} className="w-5 h-5 drop-shadow" alt="expand sidebar" />
                </button>
              )}
            </div>
          ) : (
            <>
              <img src={logoFull} alt="logo" className="h-12 w-auto object-contain transition-all duration-300" />

              <button
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                className="hidden lg:flex p-2 rounded-lg hover:bg-gray-200 transition-colors duration-150"
                type="button"
              >
                <img src={sidebarclose} className="w-5 h-5" alt="collapse sidebar" />
              </button>
            </>
          )}

          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden rounded-xl px-3 py-3 border border-gray-300 hover:bg-gray-200"
            type="button"
          >
            <img src={close} className="w-4 h-4" alt="close" />
          </button>
        </div>

        <div className={classNames("h-px bg-gray-200 flex-shrink-0", collapsed ? "mx-1" : "mx-3")} />

        <div className="flex-1 min-h-0 flex flex-col">
          {collapsed && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <CollapsedSidebar
                onNewChatWithToast={onNewChatWithToast}
                onAddNewSystem={onAddNewSystem}
                userName={userName}
                activeSystemData={activeSystemData}
                activeSession={activeSession}
                displaySystems={displaySystems}
              />
            </div>
          )}

          {!collapsed && (
            <>
              <div className="flex-1 min-h-0 overflow-visible relative">
                <ChatHistorySection
                  onNewChatWithToast={onNewChatWithToast}
                  sessions={sessions}
                  sessionsLoading={sessionsLoading}
                  sessionsHasMore={sessionsHasMore}
                  onSessionsScroll={onSessionsScroll}
                  activeId={activeId}
                  setActiveId={setActiveId}
                  editingChatId={editingChatId}
                  editingTitle={editingTitle}
                  menuOpenId={menuOpenId}
                  setEditingChatId={setEditingChatId}
                  setEditingTitle={setEditingTitle}
                  setMenuOpenId={setMenuOpenId}
                  cancelRename={cancelRename}
                  renameSessionApi={renameSessionApi}
                  deleteSessionApi={deleteSessionApi}
                  fetchSessions={fetchSessions}
                  handleDelete={handleDelete}
                  currentSystemId={activeSystemData?.systemId || activeSystemData?.name || ""}
                  showHistory={hasAnyConnectedSystems}
                />
              </div>

              <div className="flex-shrink-0 relative z-10">
                <div className="mx-3 h-px bg-gray-200 flex-shrink-0" />

                <div className="px-4 pt-3 pb-2 text-[9px] font-semibold tracking-widest text-zinc-400 uppercase flex-shrink-0">
                  Systems
                </div>

                <SystemsGrid
                  displaySystems={displaySystems}
                  connectingSid={connectingSid}
                  normalizeSid={normalizeSid}
                  setActiveSystemLocal={setActiveSystemLocal}
                  onDisconnectSystem={disconnectSystem}
                />
              </div>

              <div className="mt-auto relative z-10">
                <div className="mx-3 h-px bg-gray-200 flex-shrink-0" />

                <UserMenu
                  menuRef={menuRef}
                  userMenuOpen={userMenuOpen}
                  setUserMenuOpen={setUserMenuOpen}
                  showSystemDetails={showSystemDetails}
                  setShowSystemDetails={setShowSystemDetails}
                  activeSystemData={activeSystemData}
                  userName={userName}
                  onAddNewSystem={onAddNewSystem}
                  removeActiveSystem={removeSystem}
                  activeSession={activeSession}
                  activeTile={activeTile}
                />
              </div>
            </>
          )}
        </div>
      </aside>
    </>
  );
}

export default Sidebar;
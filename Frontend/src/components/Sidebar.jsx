import newChatIcon from "../assets/new-chat.png";
import searchIcon from "../assets/search.png";
import close from "../assets/close.png";
import logoFull from "../assets/ImplevistaLogo.png";
import logoSmall from "../assets/Vlogo.png";
import sidebaropen from "../assets/sidebar.png";
import sidebarclose from "../assets/sidebar-close.png";
import plusIcon from "../assets/plus.png";
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

  systems = [],
  handleDelete = null,

  // ✅ single-session truth from parent (Chat.jsx)
  activeSession = null, // { systemId, sapUser, firstName?, fullName? } | null
}) {
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [showCollapseBtn, setShowCollapseBtn] = useState(false);
  const [showSystemDetails, setShowSystemDetails] = useState(false);

  const menuRef = useRef(null);
  const chatMenuRef = useRef(null);
  const logoRef = useRef(null);

  const apiBase = import.meta.env.VITE_API_BASE_URL || "http://localhost:3000";

  // ✅ tiles list (one tile per credential)
  const [tiles, setTiles] = useState([]);

  // sessions
  const [sessions, setSessions] = useState([]);
  const [sessionsNextBefore, setSessionsNextBefore] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsHasMore, setSessionsHasMore] = useState(true);
  const sessionsScrollRef = useRef(null);

  // active system
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

  // ✅ load tiles from backend (separate tile per credential)
  const fetchTiles = useCallback(async () => {
    try {
      const res = await authFetch(`${apiBase}/sap/tiles`, { method: "GET" });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok || payload?.ok !== true) {
        throw new Error(payload?.error || `Failed to load tiles (${res.status})`);
      }

      const items = Array.isArray(payload.items) ? payload.items : [];

      const mapped = items
        .map((t) => ({
          ...t,
          _id: t?.key || `${t?.systemId}:${t?.sapUser}`,
          hasCredentials: true,
        }))
        .filter((x) => x.systemId && x.sapUser);

      setTiles(mapped);
    } catch (e) {
      console.warn("Failed to load /sap/tiles:", e?.message || e);
      setTiles([]);
    }
  }, [apiBase]);

  useEffect(() => {
    fetchTiles();
  }, [fetchTiles]);

  // ✅ derive active tile for SystemDetailsPanel
  const activeTile = useMemo(() => {
    const sid = normalizeSid(activeSession?.systemId || "");
    const sapUser = normalizeSapUser(activeSession?.sapUser || "");
    if (!sid || !sapUser) return null;

    return (
      (tiles || []).find((t) => normalizeSid(t?.systemId) === sid && normalizeSapUser(t?.sapUser) === sapUser) || null
    );
  }, [activeSession?.systemId, activeSession?.sapUser, normalizeSid, normalizeSapUser, tiles]);

  const fetchSessions = useCallback(
    async ({ reset = false } = {}) => {
      if (sessionsLoading) return;
      if (!reset && !sessionsHasMore) return;

      const sid = normalizeSid(activeSystemData?.systemId || activeSystemData?.name);
      if (!sid) {
        setSessions([]);
        setSessionsNextBefore(null);
        setSessionsHasMore(false);
        return;
      }

      setSessionsLoading(true);
      try {
        const limit = 20;
        const before = reset ? null : sessionsNextBefore;

        const url = new URL(`${apiBase}/chat/sessions`);
        url.searchParams.set("systemId", sid);
        url.searchParams.set("limit", String(limit));
        if (before) url.searchParams.set("before", before);

        if (activeSystemData?.sapUser) url.searchParams.set("sapUser", String(activeSystemData.sapUser));

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
            if (!id) continue;
            if (seen.has(id)) continue;
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
        setSessionsHasMore(Boolean(nextBefore) && items.length > 0);
      } catch (e) {
        console.error("Failed to fetch sessions:", e);
      } finally {
        setSessionsLoading(false);
      }
    },
    [
      activeSystemData?.name,
      activeSystemData?.sapUser,
      activeSystemData?.systemId,
      apiBase,
      sessionsHasMore,
      sessionsLoading,
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

      let hasSelectedSystem = false;
      try {
        const s = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
        hasSelectedSystem = Boolean(s?.systemId || s?.name);
      } catch {
        hasSelectedSystem = false;
      }

      if (!hasSelectedSystem) {
        setSessions([]);
        setSessionsNextBefore(null);
        setSessionsHasMore(false);
        return;
      }

      setSessionsHasMore(true);
      fetchSessions({ reset: true });
    };

    window.addEventListener("sapActiveSessionChanged", onSapSessionChanged);
    return () => window.removeEventListener("sapActiveSessionChanged", onSapSessionChanged);
  }, [fetchSessions, loadActiveSystem]);

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
    fetchSessions({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    setSessions([]);
    setSessionsNextBefore(null);
    setSessionsHasMore(true);
    fetchSessions({ reset: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSystemData?.systemId, activeSystemData?.sapUser]);

  useEffect(() => {
    const convArr = Array.isArray(conversations) ? conversations : [];

    const convSessions = convArr
      .map((c) => ({
        _id: String(c?._id || c?.id || ""),
        title: c?.title || "New chat",
        createdAt: c?.createdAt || null,
        updatedAt: typeof c?.updatedAt === "number" ? new Date(c.updatedAt).toISOString() : c?.updatedAt || null,
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

  // ✅ show ONLY saved logins (tiles)
  const displaySystems = useMemo(() => {
    return Array.isArray(tiles) ? tiles : [];
  }, [tiles]);

  const onNewChatWithToast = useCallback(() => {
    onNewChat?.();
    toast.success("New chat created");
  }, [onNewChat]);

  const setActiveSystemLocal = useCallback(
    async (sys) => {
      const sid = normalizeSid(sys?.systemId || sys?.name);
      if (!sid) return;

      const label = sys?.name || sys?.description || sid;
      const tileSapUser = normalizeSapUser(sys?.sapUser || "");

      const nextActiveSystem = {
        systemId: sid,
        name: label,
        protocol: sys?.protocol || "https",
        host: sys?.host || "",
        port: sys?.port ?? null,
        sapRouter: sys?.sapRouter || "",
        username: activeSystemData?.username || userName || "User",
        sapUser: tileSapUser || activeSystemData?.sapUser || null,
      };

      localStorage.setItem("sapActiveSystem", JSON.stringify(nextActiveSystem));
      setActiveSystemData(nextActiveSystem);

      localStorage.removeItem("chatSessionId");
      setActiveId?.("draft");
      onNewChat?.();

      const connectingKey = `${sid}:${normalizeSapUser(nextActiveSystem.sapUser || "")}`;
      setConnectingSid(connectingKey);

      const toastId = toast.loading(`Connecting to ${label}...`);

      try {
        const hasCreds = typeof sys?.hasCredentials === "boolean" ? sys.hasCredentials : null;

        if (hasCreds === false) {
          toast.error("Login required for this system.", { id: toastId });
          onOpenSapLogin?.(sys);
          return;
        }

        const connRes = await authFetch(`${apiBase}/sap/connect`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            systemId: sid,
            sapUser: nextActiveSystem.sapUser || null,
            validate: true,
          }),
        });

        const connPayload = await connRes.json().catch(() => ({}));
        if (!connRes.ok || connPayload?.ok !== true) {
          throw new Error(connPayload?.error || `Connect failed (${connRes.status})`);
        }

        const connectedSapUser = normalizeSapUser(connPayload?.sapUser || nextActiveSystem.sapUser || "");

        const updatedActive = connectedSapUser ? { ...nextActiveSystem, sapUser: connectedSapUser } : nextActiveSystem;

        localStorage.setItem("sapActiveSystem", JSON.stringify(updatedActive));
        setActiveSystemData(updatedActive);

        const firstName = String(connPayload?.firstName || "").trim();
        const fullName = String(connPayload?.fullName || "").trim();

        localStorage.setItem(
          "sapActiveSession",
          JSON.stringify({
            systemId: sid,
            sapUser: connectedSapUser,
            firstName,
            fullName,
          })
        );

        window.dispatchEvent(new Event("sapActiveSessionChanged"));

        toast.success(`Connected to ${label}`, { id: toastId });

        fetchTiles();
      } catch (e) {
        console.error("Auto-connect failed:", e);
        toast.error(e?.message || "Connect failed. Please login again.", { id: toastId });
        onOpenSapLogin?.(sys);
      } finally {
        setConnectingSid(null);
      }
    },
    [
      activeSystemData?.sapUser,
      activeSystemData?.username,
      apiBase,
      fetchTiles,
      normalizeSapUser,
      normalizeSid,
      onNewChat,
      onOpenSapLogin,
      setActiveId,
      userName,
    ]
  );

  // ✅ UPDATED removeActiveSystem with detailed console logs (your request)
  const removeActiveSystem = useCallback(async () => {
    console.log("========== REMOVE ACTIVE SYSTEM ==========");
    console.log("activeSystemData:", activeSystemData);
    console.log("activeTile:", activeTile);
    console.log("activeSession:", activeSession);

    const sid = normalizeSid(activeTile?.systemId || activeSystemData?.systemId || activeSystemData?.name);
    const sapUser = normalizeSapUser(activeTile?.sapUser || activeSystemData?.sapUser || "");

    console.log("resolved sid:", sid);
    console.log("resolved sapUser:", sapUser);

    if (!sid) {
      console.warn("ABORT: sid missing");
      toast.error("No system selected.");
      return;
    }
    if (!sapUser) {
      console.warn("ABORT: sapUser missing");
      toast.error("No SAP user found for this tile.");
      return;
    }

    const ok = window.confirm(`Remove saved login ${sid} (${sapUser})? This will not delete the system.`);
    console.log("confirm:", ok);
    if (!ok) return;

    const toastId = toast.loading(`Removing ${sid} (${sapUser})...`);

    try {
      console.log("CALL DELETE /sap/credentials ...");
      const url = new URL(`${apiBase}/sap/credentials`);
      url.searchParams.set("systemId", sid);
      url.searchParams.set("sapUser", sapUser);

      console.log("DELETE URL:", url.toString());

      const res = await authFetch(url.toString(), { method: "DELETE" });
      console.log("DELETE status:", res.status);

      const payload = await res.json().catch(() => ({}));
      console.log("DELETE payload:", payload);

      if (!res.ok || payload?.ok !== true) {
        throw new Error(payload?.error || `Remove failed (${res.status})`);
      }

      console.log("REMOVE TILE FROM UI (local state) ...");
      setTiles((prev) => {
        const beforeCount = Array.isArray(prev) ? prev.length : 0;
        const next = (Array.isArray(prev) ? prev : []).filter(
          (t) => !(normalizeSid(t?.systemId) === sid && normalizeSapUser(t?.sapUser) === sapUser)
        );
        console.log("tiles before:", beforeCount, "tiles after:", next.length);
        return next;
      });

      console.log("CLEAR localStorage sapActiveSystem/chatSessionId/sapActiveSession ...");
      localStorage.removeItem("sapActiveSystem");
      localStorage.removeItem("chatSessionId");
      localStorage.removeItem("sapActiveSession");

      console.log("DISPATCH sapActiveSessionChanged ...");
      window.dispatchEvent(new Event("sapActiveSessionChanged"));

      console.log("RESET local state (activeSystemData + active chat) ...");
      setActiveSystemData(null);
      setActiveId?.("draft");
      onNewChat?.();

      toast.success(`Removed ${sid} (${sapUser})`, { id: toastId });

      if (typeof onSystemsChanged === "function") {
        console.log("CALL onSystemsChanged ...");
        onSystemsChanged();
      }

      console.log("REFRESH tiles + sessions (safety) ...");
      await fetchTiles();
      await fetchSessions({ reset: true });

      console.log("✅ REMOVE DONE");
    } catch (e) {
      console.error("❌ REMOVE FAILED:", e);
      toast.error(e?.message || "Failed to remove saved login.", { id: toastId });
    } finally {
      console.log("FINALLY: close menu + details");
      setUserMenuOpen(false);
      setShowSystemDetails(false);
      console.log("=========================================");
    }
  }, [
    activeSystemData,
    activeTile,
    activeSession,
    apiBase,
    fetchTiles,
    fetchSessions,
    normalizeSid,
    normalizeSapUser,
    onNewChat,
    onSystemsChanged,
    setActiveId,
  ]);

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
        {/* HEADER */}
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

        {/* BODY */}
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
              <div className="flex-1 min-h-0 overflow-y-auto">
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
                />
              </div>

              <div className="flex-shrink-0">
                <div className="mx-3 h-px bg-gray-200 flex-shrink-0" />

                <div className="px-4 pt-3 pb-2 text-[9px] font-semibold tracking-widest text-zinc-400 uppercase flex-shrink-0">
                  Systems
                </div>

                <SystemsGrid
                  displaySystems={displaySystems}
                  activeSystemData={activeSystemData}
                  connectingSid={connectingSid}
                  normalizeSid={normalizeSid}
                  normalizeSapUser={normalizeSapUser}
                  setActiveSystemLocal={setActiveSystemLocal}
                  activeSession={activeSession}
                />
              </div>

              <div className="mt-auto">
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
                  removeActiveSystem={removeActiveSystem}
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
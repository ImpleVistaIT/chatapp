import close from "../assets/close.png";
import logoFull from "../assets/ImplevistaLogo.png";
import logoSmall from "../assets/Vlogo.png";
import sidebaropen from "../assets/sidebar.png";
import sidebarclose from "../assets/sidebar-close.png";
import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { toast } from "react-hot-toast";
import { authFetch } from "../api/authFetch";
import { API_BASE } from "../api/client";
import { FiChevronLeft, FiMenu, FiPlus } from "react-icons/fi";

import CollapsedSidebar from "./sidebar/CollapsedSidebar.jsx";
import SystemsGrid from "./sidebar/SystemsGrid.jsx";
import UserMenu from "./sidebar/UserMenu.jsx";
import ChatHistorySection from "./sidebar/ChatHistorySection.jsx";

function classNames(...x) {
  return x.filter(Boolean).join(" ");
}

function InlineEditableName({ value, onSave }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value || ""));

  useEffect(() => {
    if (!editing) setDraft(String(value || ""));
  }, [value, editing]);

  const commit = () => {
    const nextValue = String(draft || "").trim();
    const currentValue = String(value || "").trim();
    if (!nextValue || nextValue === currentValue) {
      setEditing(false);
      setDraft(currentValue);
      return;
    }

    onSave?.(nextValue);
    setEditing(false);
  };

  return (
    <div className="flex items-center gap-2">
      {editing ? (
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") commit();
            if (event.key === "Escape") {
              setEditing(false);
              setDraft(String(value || ""));
            }
          }}
          autoFocus
          className="min-w-0 max-w-[14rem] rounded-md border border-slate-300 bg-white px-2 py-1 text-xl font-semibold text-slate-900 outline-none focus:border-slate-900"
        />
      ) : (
        <span className="min-w-0 truncate text-xl font-semibold text-slate-900">{value}</span>
      )}

      <button
        type="button"
        onClick={() => setEditing((current) => !current)}
        className="inline-flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border border-slate-200 text-slate-500 transition hover:bg-slate-100 hover:text-slate-800"
        aria-label="Edit system name"
        title="Edit system name"
      >
        <svg viewBox="0 0 24 24" fill="none" className="h-3.5 w-3.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 20h9" />
          <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
        </svg>
      </button>
    </div>
  );
}

function SystemDetailsModal({
  open,
  systems,
  selectedSystemId,
  onSelectSystem,
  onRenameSystem,
  onClose,
}) {
  const [closing, setClosing] = useState(false);

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setClosing(false);
  }, [open]);

  if (!open) return null;

  const activeSystem = (systems || []).find((system) => system.systemId === selectedSystemId) || null;

  const handleClose = () => {
    setClosing(true);
    window.setTimeout(() => onClose?.(), 140);
  };

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 px-4 backdrop-blur-[2px]"
      onMouseDown={handleClose}
    >
      <div
        className={classNames(
          "w-full max-w-md overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.22)] transition-all duration-150",
          closing ? "translate-y-2 scale-[0.985] opacity-0" : "translate-y-0 scale-100 opacity-100"
        )}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3.5">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-slate-500">System Details</div>
            <div className="mt-1 text-xs text-slate-500">Connected systems only</div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="h-8 w-8 rounded-full border border-slate-200 text-slate-600 hover:bg-slate-50"
            aria-label="Close system details"
          >
            ×
          </button>
        </div>

        <div className="px-4 py-4">
          {systems.length > 0 ? (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {systems.map((system) => {
                  const active = system.systemId === selectedSystemId;
                  return (
                    <button
                      key={system.systemId}
                      type="button"
                      onClick={() => onSelectSystem?.(system.systemId)}
                      className={classNames(
                        "rounded-full border px-3.5 py-1.5 text-xs font-semibold transition",
                        active
                          ? "border-slate-900 bg-slate-900 text-white shadow-[0_8px_18px_rgba(15,23,42,0.18)]"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      )}
                    >
                      {system.name || system.systemId}
                    </button>
                  );
                })}
              </div>

              {activeSystem ? (
                <div className="rounded-[20px] border border-slate-200 bg-slate-50/80 p-4">
                  <div className="mb-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Selected System</div>
                    <div className="mt-1">
                      <InlineEditableName
                        value={activeSystem.name || activeSystem.systemId}
                        onSave={(nextName) => onRenameSystem?.(activeSystem, nextName)}
                      />
                    </div>
                  </div>

                  <div className="space-y-2.5 rounded-[16px] border border-white/70 bg-white p-3.5 shadow-sm">
                    <CompactDetailRow label="Name" value={activeSystem.name || activeSystem.systemId} />
                    <CompactDetailRow label="System ID" value={activeSystem.systemId || "—"} />
                    <CompactDetailRow label="Protocol" value={activeSystem.protocol || "https"} />
                    <CompactDetailRow label="Host" value={activeSystem.host || "—"} />
                    <CompactDetailRow label="Port" value={activeSystem.port || "—"} />
                    <CompactDetailRow label="SAP Router" value={activeSystem.sapRouter || "-"} />
                    <CompactDetailRow label="SAP User" value={activeSystem.sapUser || activeSystem.user || "-"} />
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <div className="rounded-[20px] border border-dashed border-slate-200 bg-slate-50 px-5 py-10 text-center">
              <div className="text-base font-semibold text-slate-900">No active system connection</div>
              <div className="mt-1.5 text-sm text-slate-500">Connect a system to continue</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CompactDetailRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2 last:border-b-0 last:pb-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{label}</div>
      <div className="text-sm font-semibold text-slate-900 text-right break-words max-w-[58%]">{value}</div>
    </div>
  );
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

  const apiBase = API_BASE;

  const [tiles, setTiles] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [sessionsNextBefore, setSessionsNextBefore] = useState(null);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [sessionsHasMore, setSessionsHasMore] = useState(true);

  const sessionsLoadingRef = useRef(false);
  const sessionsHasMoreRef = useRef(true);

  const [selectedSystemId, setSelectedSystemId] = useState("");
  const [connectingSid, setConnectingSid] = useState(null);

  const normalizeSid = (sid) => String(sid || "").trim().toUpperCase();
  const normalizeSapUser = (u) => String(u || "").trim().toUpperCase();

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
    const sid = normalizeSid(selectedSystemId || activeSession?.systemId || "");

    if (!sid) return null;

    return (tiles || []).find((t) => normalizeSid(t?.systemId || t?.name) === sid) || null;
  }, [activeSession?.systemId, selectedSystemId, tiles]);

  const displaySystems = useMemo(() => {
    return Array.isArray(tiles) ? tiles : [];
  }, [tiles]);

  const connectedSystems = useMemo(() => {
    return displaySystems.filter((sys) => {
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

  const hasAnyConnectedSystems = useMemo(() => {
    return connectedSystems.length > 0;
  }, [connectedSystems]);

  useEffect(() => {
    if (!displaySystems.length) {
      setSelectedSystemId("");
      return;
    }

    const stillValid = displaySystems.some((sys) => normalizeSid(sys.systemId) === normalizeSid(selectedSystemId));
    if (!stillValid) {
      setSelectedSystemId(displaySystems[0].systemId);
    }
  }, [displaySystems, selectedSystemId]);

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
      fetchTiles();
    };

    window.addEventListener("sapActiveSessionChanged", onSapSessionChanged);
    return () => window.removeEventListener("sapActiveSessionChanged", onSapSessionChanged);
  }, [fetchTiles]);

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

        if (normalizeSid(selectedSystemId) === sid) {
          setSelectedSystemId((current) => {
            const remaining = displaySystems.find((system) => normalizeSid(system.systemId) !== sid);
            return remaining ? remaining.systemId : "";
          });
        }

        localStorage.removeItem("chatSessionId");
        localStorage.removeItem("sapActiveSession");
        if (normalizeSid(selectedSystemId) === sid) {
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
      apiBase,
      fetchSessions,
      fetchTiles,
      onNewChat,
      onSystemsChanged,
      setActiveId,
      selectedSystemId,
      displaySystems,
    ]
  );

  const renameSystem = useCallback(
    async (sys, nextName = null) => {
      const sid = normalizeSid(sys?.systemId || sys?.name);
      if (!sid) {
        toast.error("No system selected.");
        return;
      }

      const currentName = String(sys?.name || sid).trim();
      const rawName = nextName == null ? window.prompt("Enter system name", currentName) : nextName;
      const cleanName = String(rawName || "").trim();

      if (!cleanName || cleanName === currentName) return;

      const toastId = toast.loading(`Updating ${currentName}...`);

      try {
        const res = await authFetch(`${apiBase}/sap/systems/${encodeURIComponent(sid)}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: cleanName }),
        });

        const payload = await res.json().catch(() => ({}));
        if (!res.ok || payload?.ok !== true) {
          throw new Error(payload?.error || `Rename failed (${res.status})`);
        }

        await fetchTiles();
        window.dispatchEvent(new Event("sapActiveSessionChanged"));
        toast.success(`Updated ${cleanName}`, { id: toastId });

        if (typeof onSystemsChanged === "function") {
          onSystemsChanged();
        }
      } catch (e) {
        console.error("Rename failed:", e);
        toast.error(e?.message || "Failed to update system name.", { id: toastId });
      }
    },
    [apiBase, fetchTiles, onSystemsChanged]
  );

  const removeSystem = useCallback(
    async (sys) => {
      const targetSystem = sys;
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

        if (normalizeSid(selectedSystemId) === sid) {
          localStorage.removeItem("sapActiveSystem");
          localStorage.removeItem("sapActiveSession");
          localStorage.removeItem("chatSessionId");
          setSelectedSystemId((current) => {
            const remaining = displaySystems.find((system) => normalizeSid(system.systemId) !== sid);
            return remaining ? remaining.systemId : "";
          });
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
      apiBase,
      fetchSessions,
      onNewChat,
      onSystemsChanged,
      setActiveId,
      selectedSystemId,
      displaySystems,
    ]
  );

  const selectedSystem = useMemo(() => {
    return displaySystems.find((system) => normalizeSid(system.systemId) === normalizeSid(selectedSystemId)) || null;
  }, [displaySystems, selectedSystemId]);

  const handleOpenSystemDetails = useCallback(() => {
    if (!selectedSystemId && displaySystems.length > 0) {
      setSelectedSystemId(displaySystems[0].systemId);
    }
    setShowSystemDetails(true);
  }, [displaySystems, selectedSystemId]);

  const handleSelectSystem = useCallback((systemId) => {
    setSelectedSystemId(normalizeSid(systemId));
  }, []);

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
          "ai-surface z-50 flex flex-col border-r border-slate-200/80 bg-white/90",
          "fixed inset-y-0 left-0 md:static",
          "transform transition-all duration-300 ease-in-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "md:translate-x-0",
          collapsed ? "w-18" : "w-80"
        )}
      >
        <div className={classNames("flex items-center justify-between flex-shrink-0 border-b border-slate-200/80", collapsed ? "px-2 py-3" : "px-4 py-3")}>
          {collapsed ? (
            <div
              ref={logoRef}
              className="relative group/logo flex items-center justify-center flex-1"
              onMouseEnter={() => setShowCollapseBtn(true)}
              onMouseLeave={() => setShowCollapseBtn(false)}
            >
              <img src={logoSmall} alt="logo" className="h-10 w-10 rounded-2xl object-contain shadow-sm transition-all duration-300" />
              {showCollapseBtn && (
                <button
                  onClick={() => setCollapsed(false)}
                  title="Expand sidebar"
                  className="absolute inset-0 flex items-center justify-center rounded-2xl bg-slate-900/10 text-slate-700 transition-all duration-150 hover:bg-slate-900/20"
                  type="button"
                >
                  <FiMenu className="h-5 w-5" />
                </button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-center gap-3">
                <img src={logoFull} alt="logo" className="h-12 w-auto object-contain transition-all duration-300" />
                {/* <div className="hidden xl:block">
                  <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-400">Workspace</div>
                  <div className="text-sm font-semibold text-slate-900">Enterprise AI</div>
                </div> */}
              </div>

              <button
                onClick={() => setCollapsed(true)}
                title="Collapse sidebar"
                className="hidden lg:flex items-center justify-center rounded-xl border border-slate-200 bg-white p-2 text-slate-500 shadow-sm ai-smooth hover:bg-slate-50 hover:text-slate-800"
                type="button"
              >
                <FiChevronLeft className="h-4 w-4" />
              </button>
            </>
          )}

          <button
            onClick={() => setSidebarOpen(false)}
            className="md:hidden rounded-xl px-3 py-3 border border-slate-200 bg-white text-slate-600 shadow-sm ai-smooth hover:bg-slate-50"
            type="button"
          >
            <FiChevronLeft className="h-4 w-4" />
          </button>
        </div>

        <div className={classNames("h-px bg-slate-200/80 flex-shrink-0", collapsed ? "mx-1" : "mx-4")} />

        <div className="flex-1 min-h-0 flex flex-col">
          {collapsed && (
            <div className="flex-1 min-h-0 overflow-hidden">
              <CollapsedSidebar
                onNewChatWithToast={onNewChatWithToast}
                onAddNewSystem={onAddNewSystem}
                userName={userName}
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
                  currentSystemId={selectedSystem?.systemId || ""}
                  showHistory={hasAnyConnectedSystems}
                />
              </div>

              <div className="flex-shrink-0 relative z-10">
                <div className="mx-4 h-px bg-slate-200/80 flex-shrink-0" />

                <div className="px-4 pt-4 pb-2 text-[10px] font-semibold tracking-[0.22em] text-slate-400 uppercase flex-shrink-0">
                  Systems
                </div>

                <SystemsGrid
                  displaySystems={displaySystems}
                  connectingSid={connectingSid}
                  normalizeSid={normalizeSid}
                  setActiveSystemLocal={setActiveSystemLocal}
                  onRenameSystem={renameSystem}
                  onDisconnectSystem={disconnectSystem}
                />
              </div>

              <div className="mt-auto relative z-10">
                <div className="mx-4 h-px bg-slate-200/80 flex-shrink-0" />

                <UserMenu
                  menuRef={menuRef}
                  userMenuOpen={userMenuOpen}
                  setUserMenuOpen={setUserMenuOpen}
                  showSystemDetails={showSystemDetails}
                  setShowSystemDetails={handleOpenSystemDetails}
                  systems={displaySystems}
                  selectedSystemId={selectedSystemId}
                  onSelectSystem={handleSelectSystem}
                  userName={userName}
                  onAddNewSystem={onAddNewSystem}
                  removeActiveSystem={removeSystem}
                  activeSession={activeSession}
                />
              </div>
            </>
          )}
        </div>
      </aside>

      <SystemDetailsModal
        open={showSystemDetails}
        systems={connectedSystems}
        selectedSystemId={selectedSystemId}
        onSelectSystem={handleSelectSystem}
        onRenameSystem={renameSystem}
        onClose={() => setShowSystemDetails(false)}
      />
    </>
  );
}

export default Sidebar;

//manas logic

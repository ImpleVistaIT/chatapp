import { useEffect, useRef, useState } from "react";
import logoFull from "../assets/ImplevistaLogo.png";
import { authFetch } from "../api/authFetch";

function normalizeSystemId(sid) {
  return String(sid || "").trim().toUpperCase();
}

export default function SapLogin({ onConnected, onBack, selectedSystem = null }) {
  const [error, setError] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [fadeIn, setFadeIn] = useState(false);

  const submitLockRef = useRef(false);

  const [invalidAttempts, setInvalidAttempts] = useState(0);
  const invalidAttemptsRef = useRef(0);

  const [showPassword, setShowPassword] = useState(false);

  function markForceSapLoginReload() {
    try {
      localStorage.setItem("forceSapLogin", "1");
      localStorage.removeItem("sapActiveSession");
      localStorage.removeItem("chatSessionId");
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    setFadeIn(true);
  }, []);

  const apiBase =
    (typeof import.meta !== "undefined" && import.meta.env && import.meta.env.VITE_API_BASE_URL) ||
    "http://localhost:3000";

  // ----------------------------
  // System fields (generic)
  // ----------------------------
  const [name, setName] = useState(selectedSystem?.name || "");
  const [systemId, setSystemId] = useState(selectedSystem?.systemId || "");
  const [protocol, setProtocol] = useState(selectedSystem?.protocol || "https");
  const [host, setHost] = useState(selectedSystem?.host || "");
  const [port, setPort] = useState(selectedSystem?.port != null ? String(selectedSystem.port) : "");
  const [sapRouter, setSapRouter] = useState(selectedSystem?.sapRouter || "");

  // ----------------------------
  // Credentials
  // ----------------------------
  const [sapUser, setSapUser] = useState("");
  const [sapPassword, setSapPassword] = useState("");

  useEffect(() => {
    try {
      const active = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
      if (active?.sapUser) setSapUser(String(active.sapUser));
      else if (active?.username) setSapUser(String(active.username));
    } catch {
      // ignore
    }
  }, []);

  function bumpInvalidAttempt() {
    const next = invalidAttemptsRef.current + 1;
    invalidAttemptsRef.current = next;
    setInvalidAttempts(next);

    setError(`${next} invalid login${next > 1 ? "s" : ""}.`);

    if (next >= 3) {
      submitLockRef.current = false;
      setIsLoading(false);
      setSapPassword("");

      markForceSapLoginReload();

      setTimeout(() => {
        window.location.reload();
      }, 600);
    }
  }

  function resetInvalidAttempts() {
    invalidAttemptsRef.current = 0;
    setInvalidAttempts(0);
  }

  async function addOrUpdateSystem(e) {
    e?.preventDefault?.();

    if (submitLockRef.current) return;
    submitLockRef.current = true;

    setError("");

    const sid = normalizeSystemId(systemId);
    const sysName = String(name || "").trim();
    const proto = String(protocol || "https").trim().toLowerCase() === "http" ? "http" : "https";
    const h = String(host || "").trim();
    const p = Number(String(port || "").trim());

    const u = String(sapUser || "").trim();
    const pw = String(sapPassword || "").trim();

    if (!sysName || !sid || !h || !port || !u || !pw) {
      setError("Please fill all required fields.");
      submitLockRef.current = false;
      return;
    }

    if (!/^[A-Z0-9]{3}$/.test(sid)) {
      setError("System ID must be 3 characters (e.g. S4D, HSM).");
      submitLockRef.current = false;
      return;
    }

    if (!Number.isFinite(p) || p <= 0 || p > 65535) {
      setError("Port must be a valid number (1..65535).");
      submitLockRef.current = false;
      return;
    }

    setIsLoading(true);

    try {
      const sysRes = await authFetch(`${apiBase}/sap/systems`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId: sid,
          name: sysName,
          protocol: proto,
          host: h,
          port: p,
          sapRouter: sapRouter.trim(),
        }),
      });

      const sysPayload = await sysRes.json().catch(() => ({}));
      if (!sysRes.ok || sysPayload?.ok !== true) {
        throw new Error(sysPayload?.error || `Failed to save system (${sysRes.status})`);
      }

      const savedSystem = sysPayload.item;

      const credRes = await authFetch(`${apiBase}/sap/credentials`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemId: sid,
          sapUser: u,
          sapPassword: pw,
          validate: true,
        }),
      });

      const credPayload = await credRes.json().catch(() => ({}));
      if (!credRes.ok || credPayload?.ok !== true) {
        bumpInvalidAttempt();
        throw new Error(credPayload?.error || `Invalid SAP credentials (${credRes.status})`);
      }

      const connRes = await authFetch(`${apiBase}/sap/connect`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ systemId: sid, sapUser: u, validate: true }),
      });

      const connPayload = await connRes.json().catch(() => ({}));
      if (!connRes.ok || connPayload?.ok !== true) {
        bumpInvalidAttempt();
        throw new Error(connPayload?.error || `Connect failed (${connRes.status})`);
      }

      resetInvalidAttempts();

      const connectedSapUser = String(connPayload?.sapUser || u).trim();

      let firstName = "";
      let fullName = "";
      try {
        const profRes = await authFetch(`${apiBase}/sap/user-profile`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ systemId: sid, sapUser: connectedSapUser }),
        });

        const profPayload = await profRes.json().catch(() => ({}));
        if (profRes.ok && profPayload?.ok === true) {
          const p = profPayload.profile || profPayload;
          firstName = String(p?.firstName || p?.Firstname || "").trim();
          fullName = String(p?.fullName || p?.Fullname || "").trim();
        }
      } catch {
        // optional
      }

      let prev = null;
      try {
        prev = JSON.parse(localStorage.getItem("sapActiveSystem") || "null");
      } catch {
        prev = null;
      }

      const activeSystem = {
        systemId: sid,
        name: sysName,
        protocol: proto,
        host: h,
        port: p,
        sapRouter: sapRouter.trim(),
        username: prev?.username || localStorage.getItem("user") || "User",
        sapUser: connectedSapUser,
      };

      localStorage.setItem("sapActiveSystem", JSON.stringify(activeSystem));
      localStorage.setItem(
        "sapActiveSession",
        JSON.stringify({
          systemId: sid,
          sapUser: connectedSapUser,
          firstName,
          fullName,
        })
      );

      localStorage.removeItem("forceSapLogin");
      localStorage.removeItem("sapConnected");
      localStorage.removeItem("chatSessionId");

      setIsLoading(false);

      onConnected?.({
        systemId: sid,
        sapUser: connectedSapUser,
        firstName,
        fullName,
        system: savedSystem || activeSystem,
      });
    } catch (err) {
      setIsLoading(false);
      setError((prev) => prev || err?.message || "Failed to configure system.");
    } finally {
      submitLockRef.current = false;
    }
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center px-2 py-3 sm:px-3 sm:py-4 overflow-x-hidden">
      <style>{`
        @keyframes fadeInScale {
          from { opacity: 0; transform: scale(0.95); }
          to   { opacity: 1; transform: scale(1); }
        }

        @keyframes slideUp {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }

        .animate-fadeInScale { animation: fadeInScale 0.5s ease-out forwards; }

        .animate-slideUp {
          animation: slideUp 0.4s ease-out forwards;
          opacity: 0;
        }

        .input-delay-1 { animation-delay: 0.1s; }
        .input-delay-2 { animation-delay: 0.15s; }
        .input-delay-3 { animation-delay: 0.2s; }
        .input-delay-4 { animation-delay: 0.25s; }
        .input-delay-5 { animation-delay: 0.3s; }
        .input-delay-6 { animation-delay: 0.35s; }

        body { overflow-x: hidden; }
      `}</style>

      <div className="w-full max-w-3xl">
        <div
          className={`bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden transition-all duration-500 max-h-[95vh] flex flex-col ${
            fadeIn ? "animate-fadeInScale" : ""
          }`}
        >
          <div className="px-3 sm:px-6 pt-2 pb-2 sm:pb-3 bg-gradient-to-r from-green-50 to-emerald-50 border-b border-gray-100 flex-shrink-0">
            <div className="flex items-center justify-center">
              <img
                src={logoFull}
                alt="ImpleVista"
                className="h-7 sm:h-9 w-auto object-contain transition-transform duration-300 hover:scale-110"
              />
            </div>

            <h1 className="mt-1.5 sm:mt-2 text-center text-sm sm:text-lg font-bold text-zinc-900">
              {selectedSystem ? `Configure ${selectedSystem.name}` : "Configure SAP System"}
            </h1>
            <p className="mt-0.5 text-center text-[10px] sm:text-xs text-zinc-500 font-medium">
              Add or connect to any SAP system
            </p>
          </div>

          <div className="px-3 sm:px-6 py-2 sm:py-3 overflow-y-auto flex-1">
            {error && (
              <div className="mb-2 sm:mb-3 rounded-lg border border-red-200 bg-red-50 px-2 sm:px-3 py-1.5 sm:py-2 text-[10px] sm:text-xs text-red-700 font-medium shadow-sm animate-slideUp flex-shrink-0">
                <div className="flex items-start gap-2">
                  <svg
                    className="w-3 sm:w-4 h-3 sm:h-4 flex-shrink-0 mt-0.5"
                    fill="currentColor"
                    viewBox="0 0 20 20"
                  >
                    <path
                      fillRule="evenodd"
                      d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                      clipRule="evenodd"
                    />
                  </svg>
                  <span>{error}</span>
                </div>

                {invalidAttempts > 0 && invalidAttempts < 3 && (
                  <div className="mt-1 text-[10px] sm:text-xs text-red-600">
                    Attempts remaining: {3 - invalidAttempts}
                  </div>
                )}
              </div>
            )}

            <form onSubmit={addOrUpdateSystem}>
              <div className="space-y-1.5 sm:space-y-2">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="animate-slideUp input-delay-1 flex flex-col">
                    <label className="text-[10px] sm:text-xs font-semibold text-zinc-700 mb-1">
                      System Name *
                    </label>
                    <input
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[10px] sm:text-xs text-zinc-900 outline-none transition-all duration-300 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 hover:border-gray-400"
                      placeholder="e.g., HIMALAYA SOLMAN PRD / S4 DEV / ECC QA"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                    />
                  </div>

                  <div className="animate-slideUp input-delay-2 flex flex-col">
                    <label className="text-[10px] sm:text-xs font-semibold text-zinc-700 mb-1">
                      System ID (SID) *
                    </label>
                    <input
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[10px] sm:text-xs text-zinc-900 outline-none transition-all duration-300 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 hover:border-gray-400"
                      placeholder="e.g., HSM"
                      value={systemId}
                      onChange={(e) => setSystemId(e.target.value.toUpperCase())}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
                  <div className="animate-slideUp input-delay-3 flex flex-col">
                    <label className="text-[10px] sm:text-xs font-semibold text-zinc-700 mb-1">
                      Protocol *
                    </label>
                    <select
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[10px] sm:text-xs text-zinc-900 outline-none transition-all duration-300 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 hover:border-gray-400"
                      value={protocol}
                      onChange={(e) => setProtocol(e.target.value)}
                    >
                      <option value="https">https</option>
                      <option value="http">http</option>
                    </select>
                  </div>

                  <div className="animate-slideUp input-delay-4 flex flex-col sm:col-span-2">
                    <label className="text-[10px] sm:text-xs font-semibold text-zinc-700 mb-1">
                      Host *
                    </label>
                    <input
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[10px] sm:text-xs text-zinc-900 outline-none transition-all duration-300 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 hover:border-gray-400"
                      placeholder="e.g., 192.168.5.139 or sap.company.com"
                      value={host}
                      onChange={(e) => setHost(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="animate-slideUp input-delay-5 flex flex-col">
                    <label className="text-[10px] sm:text-xs font-semibold text-zinc-700 mb-1">
                      Port *
                    </label>
                    <input
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[10px] sm:text-xs text-zinc-900 outline-none transition-all duration-300 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 hover:border-gray-400"
                      placeholder="e.g., 5243 or 44300"
                      value={port}
                      onChange={(e) => setPort(e.target.value)}
                    />
                  </div>

                  <div className="animate-slideUp input-delay-6 flex flex-col">
                    <label className="text-[10px] sm:text-xs font-semibold text-zinc-700 mb-1">
                      SAProuter (optional)
                    </label>
                    <input
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[10px] sm:text-xs text-zinc-900 outline-none transition-all duration-300 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 hover:border-gray-400"
                      placeholder="e.g., /H/sap.company.com"
                      value={sapRouter}
                      onChange={(e) => setSapRouter(e.target.value)}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                  <div className="animate-slideUp input-delay-3 flex flex-col">
                    <label className="text-[10px] sm:text-xs font-semibold text-zinc-700 mb-1">
                      SAP Username *
                    </label>
                    <input
                      className="rounded-lg border border-gray-300 bg-white px-2 py-1.5 text-[10px] sm:text-xs text-zinc-900 outline-none transition-all duration-300 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 hover:border-gray-400"
                      placeholder="SAP User"
                      value={sapUser}
                      onChange={(e) => setSapUser(e.target.value)}
                      autoComplete="username"
                    />
                  </div>

                  <div className="animate-slideUp input-delay-4 flex flex-col">
                    <label className="text-[10px] sm:text-xs font-semibold text-zinc-700 mb-1">
                      Password *
                    </label>

                    <div className="relative">
                      <input
                        type={showPassword ? "text" : "password"}
                        className="w-full rounded-lg border border-gray-300 bg-white px-2 py-1.5 pr-10 text-[10px] sm:text-xs text-zinc-900 outline-none transition-all duration-300 focus:border-green-600 focus:ring-2 focus:ring-green-600/20 hover:border-gray-400"
                        placeholder="••••••••"
                        value={sapPassword}
                        onChange={(e) => setSapPassword(e.target.value)}
                        autoComplete="current-password"
                      />

                      <button
                        type="button"
                        onClick={() => setShowPassword((v) => !v)}
                        aria-label={showPassword ? "Hide password" : "Show password"}
                        title={showPassword ? "Hide password" : "Show password"}
                        className="absolute right-1 top-1/2 -translate-y-1/2 rounded-md p-1 text-zinc-600 hover:text-zinc-900 hover:bg-gray-50"
                      >
                        {showPassword ? (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="h-4 w-4"
                          >
                            <path d="M3 3l18 18" />
                            <path d="M10.58 10.58A2 2 0 0 0 12 14a2 2 0 0 0 1.42-.59" />
                            <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c7 0 10 8 10 8a18.4 18.4 0 0 1-2.03 3.17" />
                            <path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 8 10 8a10.9 10.9 0 0 0 4.09-.77" />
                          </svg>
                        ) : (
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                            className="h-4 w-4"
                          >
                            <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
                            <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
                          </svg>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-3 sm:mt-4 grid grid-cols-2 gap-2 sm:gap-3">
                <button
                  type="button"
                  onClick={onBack}
                  disabled={isLoading}
                  className={`w-full rounded-lg border border-gray-200 bg-white px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-zinc-700 shadow-sm hover:bg-gray-50 transition-all duration-300 ${
                    isLoading ? "opacity-75 cursor-not-allowed" : ""
                  }`}
                >
                  Back
                </button>

                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full rounded-lg bg-green-600 px-3 py-1.5 sm:py-2 text-xs sm:text-sm font-semibold text-white shadow-md hover:shadow-lg hover:bg-green-700 transition-all duration-300 transform hover:scale-[1.02] active:scale-[0.98] ${
                    isLoading ? "opacity-75 cursor-not-allowed" : ""
                  }`}
                >
                  {isLoading ? (
                    <span className="flex items-center justify-center gap-2">
                      <svg
                        className="animate-spin h-3 w-3"
                        xmlns="http://www.w3.org/2000/svg"
                        fill="none"
                        viewBox="0 0 24 24"
                      >
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                        />
                      </svg>
                      <span className="hidden sm:inline">Connecting...</span>
                    </span>
                  ) : (
                    `Configure ${selectedSystem?.name || "System"}`
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="mt-2 sm:mt-3 text-center text-[10px] sm:text-xs text-zinc-500">
          <p>© 2026 ImpleVista. All rights reserved.</p>
        </div>
      </div>
    </div>
  );
}
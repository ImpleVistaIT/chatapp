import { useMemo, useState } from "react";
import logoFull from "../assets/ImplevistaLogo.png";

export default function SapLogin({ onConnected }) {
  // Only 2 contents:
  // - "new" => New system login content
  // - "existing" => Existing system login content
  const [view, setView] = useState("new");
  const [error, setError] = useState("");
  const [showPwd, setShowPwd] = useState(false);

  // TEMP hardcoded existing system credentials (frontend only)
  const EXISTING = useMemo(
    () => ({
      ip: "10.0.0.1",
      username: "SAPUSER",
      password: "Pass@123",
    }),
    []
  );

  // -------- New system fields ----------
  const [description, setDescription] = useState("");
  const [applicationServer, setApplicationServer] = useState("");
  const [instanceNumber, setInstanceNumber] = useState("");
  const [systemId, setSystemId] = useState("");
  const [saprouter, setSaprouter] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState("");

  // -------- Existing system fields ----------
  const [ip, setIp] = useState("");
  const [exUsername, setExUsername] = useState("");
  const [exPassword, setExPassword] = useState("");

  function addNewSystem(e) {
    e?.preventDefault?.();
    setError("");

    if (
      !description.trim() ||
      !applicationServer.trim() ||
      !instanceNumber.trim() ||
      !systemId.trim() ||
      !newUsername.trim() ||
      !newPassword
    ) {
      setError("Please fill all required fields.");
      return;
    }

    // Save locally (no API)
    const system = {
      type: "new",
      description: description.trim(),
      applicationServer: applicationServer.trim(),
      instanceNumber: instanceNumber.trim(),
      systemId: systemId.trim(),
      saprouter: saprouter.trim(),
      username: newUsername.trim(),
    };

    localStorage.setItem("sapConnected", "true");
    localStorage.setItem("sapActiveSystem", JSON.stringify(system));

    onConnected?.();
  }

  function connectExisting(e) {
    e?.preventDefault?.();
    setError("");

    if (
      ip.trim() === EXISTING.ip &&
      exUsername.trim() === EXISTING.username &&
      exPassword === EXISTING.password
    ) {
      const system = { type: "existing", ip: ip.trim(), username: exUsername.trim() };

      localStorage.setItem("sapConnected", "true");
      localStorage.setItem("sapActiveSystem", JSON.stringify(system));

      onConnected?.();
      return;
    }

    setError("Invalid system IP / username / password (temp frontend validation).");
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-xl">
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          <div className="px-8 pt-8 pb-6 bg-white">
            <div className="flex items-center justify-center">
              <img src={logoFull} alt="ImpleVista" className="h-12 w-auto object-contain" />
            </div>

            <h1 className="mt-6 text-center text-xl font-semibold text-zinc-900">
              SAP System Login
            </h1>
            <p className="mt-1 text-center text-sm text-zinc-500">
              {view === "new" ? "Add New System" : "Connect to Existing System"}
            </p>
          </div>

          <div className="px-8 pb-8">
            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            {view === "new" ? (
              <form onSubmit={addNewSystem}>
                <label className="block text-sm font-medium text-zinc-700">Description *</label>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-zinc-700">
                  Application Server *
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={applicationServer}
                  onChange={(e) => setApplicationServer(e.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-zinc-700">
                  Instance Number *
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={instanceNumber}
                  onChange={(e) => setInstanceNumber(e.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-zinc-700">System ID *</label>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={systemId}
                  onChange={(e) => setSystemId(e.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-zinc-700">
                  SAProuter String
                </label>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={saprouter}
                  onChange={(e) => setSaprouter(e.target.value)}
                />

                <div className="my-6 border-t border-gray-200" />

                <label className="block text-sm font-medium text-zinc-700">Username *</label>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-zinc-700">Password *</label>
                <input
                  type="password"
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                />

                <button
                  type="submit"
                  className="mt-6 w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition"
                >
                  Add new system
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setView("existing");
                  }}
                  className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 hover:bg-gray-50 transition"
                >
                  Connect to existing system
                </button>
              </form>
            ) : (
              <form onSubmit={connectExisting}>
                <label className="block text-sm font-medium text-zinc-700">System IP *</label>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={ip}
                  onChange={(e) => setIp(e.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-zinc-700">Username *</label>
                <input
                  className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                  value={exUsername}
                  onChange={(e) => setExUsername(e.target.value)}
                />

                <label className="mt-5 block text-sm font-medium text-zinc-700">Password *</label>
                <div className="mt-2 relative">
                  <input
                    type={showPwd ? "text" : "password"}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-24 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                    value={exPassword}
                    onChange={(e) => setExPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-1 text-xs font-semibold text-zinc-700 hover:bg-gray-100"
                  >
                    {showPwd ? "Hide" : "Show"}
                  </button>
                </div>

                <button
                  type="submit"
                  className="mt-6 w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 transition"
                >
                  Connect to system
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setError("");
                    setView("new");
                  }}
                  className="mt-3 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-semibold text-zinc-800 hover:bg-gray-50 transition"
                >
                  Add new system
                </button>

                <div className="mt-4 text-xs text-zinc-500">
                  Temp demo: IP <b>10.0.0.1</b>, user <b>SAPUSER</b>, password <b>Pass@123</b>
                </div>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
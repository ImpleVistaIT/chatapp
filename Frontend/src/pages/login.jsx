import { useMemo, useState } from "react";
import logoFull from "../assets/ImplevistaLogo.png"; // ✅ use your company logo

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState("");

  // ✅ Hardcoded credentials (same as before)
  const DEMO_USER = useMemo(
    () => ({
      username: "iram",
      password: "Rama@1234",
    }),
    []
  );

  function handleLogin(e) {
    e?.preventDefault?.();
    setError("");

    const u = username.trim();

    if (u === DEMO_USER.username && password === DEMO_USER.password) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("user", u); // ✅ show in profile later
      onLogin();
      return;
    }

    setError("Invalid username or password");
  }

  const canSubmit = username.trim().length > 0 && password.length > 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Card */}
        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden">
          {/* Top section with logo */}
          <div className="px-8 pt-8 pb-6 bg-white">
            <div className="flex items-center justify-center">
              <img
                src={logoFull}
                alt="ImpleVista"
                className="h-12 w-auto object-contain"
              />
            </div>

            <h1 className="mt-6 text-center text-xl font-semibold text-zinc-900">
              Sign in
            </h1>
            <p className="mt-1 text-center text-sm text-zinc-500">
              Enter your credentials to continue
            </p>
          </div>

          {/* Form */}
          <form onSubmit={handleLogin} className="px-8 pb-8">
            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <label className="block text-sm font-medium text-zinc-700">
              Username
            </label>
            <input
              type="text"
              placeholder="Enter username"
              className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />

            <label className="mt-5 block text-sm font-medium text-zinc-700">
              Password
            </label>
            <div className="mt-2 relative">
              <input
                type={showPwd ? "text" : "password"}
                placeholder="Enter password"
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 pr-24 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-4 focus:ring-green-600/10"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
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
              disabled={!canSubmit}
              className="mt-6 w-full rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-green-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed transition"
            >
              Login
            </button>

            <div className="mt-5 text-center text-xs text-zinc-500">
              © {new Date().getFullYear()} ImpleVista. All rights reserved.
            </div>
          </form>
        </div>

       
      </div>
    </div>
  );
}
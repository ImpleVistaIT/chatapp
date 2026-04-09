import { useState } from "react";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  // ✅ Hardcoded credentials
  const DEMO_USER = {
    username: "iram",
    password: "Rama@1234",
  };

  function handleLogin() {
    const u = username.trim();

    if (u === DEMO_USER.username && password === DEMO_USER.password) {
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("user", u); // ✅ for profile name
      onLogin();
    } else {
      alert("Invalid credentials");
    }
  }

  return (
    <div className="h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-6 rounded-xl shadow-md w-80">
        <h2 className="text-lg font-semibold mb-4">Login</h2>

        <input
          type="text"
          placeholder="Username"
          className="w-full border p-2 mb-3"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
        />

        <input
          type="password"
          placeholder="Password"
          className="w-full border p-2 mb-3"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <button
          onClick={handleLogin}
          className="w-full bg-green-600 text-white py-2 rounded"
        >
          Login
        </button>
      </div>
    </div>
  );
}
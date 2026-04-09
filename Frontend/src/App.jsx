import { useEffect, useState } from "react";
import Chat from "./components/Chat";
import Login from "./pages/login";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  useEffect(() => {
    const loggedIn = localStorage.getItem("isLoggedIn");
    setIsAuthenticated(loggedIn === "true");
  }, []);

  const handleLogin = () => {
    localStorage.setItem("isLoggedIn", "true");
    setIsAuthenticated(true);
  };

  const handleLogout = () => {
    // ✅ clear auth state
    localStorage.removeItem("isLoggedIn");

    // optional: clear anything else you store
    localStorage.removeItem("user");
    localStorage.removeItem("token");
    localStorage.removeItem("conversationId");

    setIsAuthenticated(false);
  };

  if (!isAuthenticated) {
    return <Login onLogin={handleLogin} />;
  }

  return <Chat onLogout={handleLogout} />;
}
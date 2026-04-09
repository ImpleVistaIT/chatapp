import { useEffect, useState } from "react";
import Chat from "./components/Chat";
import Login from "./pages/login";
import Toast from "./components/Toast";

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // ✅ Simple toast state (no libraries)
  const [toast, setToast] = useState(null);

  useEffect(() => {
    const loggedIn = localStorage.getItem("isLoggedIn");
    setIsAuthenticated(loggedIn === "true");
  }, []);

  const showToast = (t) => {
    setToast({ duration: 2500, ...t });
  };

  const handleLogin = () => {
    localStorage.setItem("isLoggedIn", "true");
    setIsAuthenticated(true);

    showToast({
      type: "success",
      title: "Success",
      message: "Logged in successfully",
    });
  };

  const handleLogout = () => {
  localStorage.removeItem("isLoggedIn");
  localStorage.removeItem("user");
  localStorage.removeItem("token");
  localStorage.removeItem("conversationId");

  setIsAuthenticated(false);

  showToast({
    type: "error",              // ✅ makes it red
    title: "Logged out",
    message: "You have been logged out successfully",
  });
};

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />

      {!isAuthenticated ? (
        <Login onLogin={handleLogin} />
      ) : (
        <Chat onLogout={handleLogout} />
      )}
    </>
  );
}
import { useEffect, useState } from "react";
import Chat from "./components/Chat";
import SapLogin from "./pages/saplogin";
import Toast from "./components/Toast";
import { clearAccessToken } from "./api/client";

export default function App() {
  // ✅ Toast state
  const [toast, setToast] = useState(null);

  // ✅ Screen control
  const [showSapLogin, setShowSapLogin] = useState(false);

  useEffect(() => {
    function handleAuthExpired() {
      clearAccessToken();
      setShowSapLogin(true);
      setToast({
        type: "error",
        message: "Your session has expired. Please login again.",
      });
    }

    window.addEventListener("auth:expired", handleAuthExpired);

    return () => {
      window.removeEventListener("auth:expired", handleAuthExpired);
    };
  }, []);

  return (
    <>
      {/* Toast */}
      <Toast toast={toast} onClose={() => setToast(null)} />

      {/* Screen Switch */}
      {showSapLogin ? (
        <SapLogin
          onConnected={() => {
            setShowSapLogin(false);

            setToast({
              type: "success",
              message: "SAP connected successfully!",
            });
          }}

          onBack={() => setShowSapLogin(false)}
        />
      ) : (
        <Chat
          onToast={setToast}
          onOpenLogin={() => setShowSapLogin(true)}
        />
      )}
    </>
  );
}
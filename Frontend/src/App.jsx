import { useState } from "react";
import Chat from "./components/Chat";
import SapLogin from "./pages/saplogin";
import Toast from "./components/Toast";

export default function App() {
  // ✅ Toast state
  const [toast, setToast] = useState(null);

  // ✅ Screen control
  const [showSapLogin, setShowSapLogin] = useState(false);

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
          onOpenLogin={() => setShowSapLogin(true)}
        />
      )}
    </>
  );
}
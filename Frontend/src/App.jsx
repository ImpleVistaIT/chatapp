import { useState } from "react";
import Chat from "./components/Chat";
import Toast from "./components/Toast";

export default function App() {
  // ✅ Simple toast state (no libraries)
  const [toast, setToast] = useState(null);

  return (
    <>
      <Toast toast={toast} onClose={() => setToast(null)} />
      <Chat />
    </>
  );
}
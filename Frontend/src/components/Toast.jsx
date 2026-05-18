import { useEffect } from "react";

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => onClose?.(), toast.duration ?? 2500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const base =
    "fixed top-4 right-4 z-[9999] min-w-[260px] max-w-[360px] rounded-xl border px-4 py-3 shadow-lg";
  const styles =
    toast.type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : toast.type === "error"
        ? "bg-rose-50 border-rose-200 text-rose-800"
        : "bg-gray-50 border-gray-200 text-gray-800";

  return (
    <div className={`${base} ${styles}`} role="status" aria-live="polite">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-semibold">{toast.title || "Notification"}</div>

        <button
          type="button"
          onClick={onClose}
          className="text-xs font-bold opacity-70 hover:opacity-100"
          aria-label="Close toast"
        >
          ✕
        </button>
      </div>

      {toast.message ? (
        <div className="mt-1 text-sm opacity-90">{toast.message}</div>
      ) : null}
    </div>
  );
}
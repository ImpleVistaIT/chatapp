import { useEffect } from "react";

export default function Toast({ toast, onClose }) {
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => onClose?.(), toast.duration ?? 2500);
    return () => clearTimeout(t);
  }, [toast, onClose]);

  if (!toast) return null;

  const base =
    "fixed top-4 right-4 z-[9999] min-w-[260px] max-w-[360px] rounded-2xl border px-4 py-3 shadow-[0_8px_24px_rgba(15,23,42,0.08)]";
  const styles =
    toast.type === "success"
      ? "bg-emerald-50 border-emerald-200 text-emerald-900"
      : toast.type === "error"
        ? "bg-rose-50 border-rose-200 text-rose-900"
        : "bg-white border-slate-200 text-slate-800";

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

      {Number.isFinite(Number(toast.progress)) ? (
        <div className="mt-3">
          <div className="h-2 overflow-hidden rounded-full bg-black/10">
            <div
              className="h-full rounded-full bg-current transition-all duration-200"
              style={{ width: `${Math.max(0, Math.min(100, Number(toast.progress)))}%` }}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
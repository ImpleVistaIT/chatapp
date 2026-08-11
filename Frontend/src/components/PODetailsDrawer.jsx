import { createPortal } from "react-dom";
import { useEffect } from "react";

function formatValue(value) {
  if (value == null) return "-";
  const text = String(value).trim();
  return text || "-";
}

export default function PODetailsDrawer({ open, loading, error, data, onClose }) {
  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose?.();
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const title = `PO ${formatValue(data?.poNumber)}`;

  const content = (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/40 backdrop-blur-[1px]" onMouseDown={onClose}>
      <aside
        className="flex h-full w-full max-w-full flex-col bg-white shadow-[0_0_40px_rgba(15,23,42,0.25)] sm:w-[58vw] md:w-[44vw] lg:w-[38vw] xl:w-[35vw]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div className="min-w-0">
            <div className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">Purchase Order Details</div>
            <div className="mt-1 break-words text-sm font-semibold text-slate-900">{title}</div>
          </div>
          <button type="button" onClick={onClose} className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 text-slate-700 transition hover:bg-slate-50" aria-label="Close PO drawer">×</button>
        </div>

        <div className="flex-1 overflow-y-auto px-4 py-4">
          {loading ? (
            <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-8 text-sm text-slate-600">Loading PO details...</div>
          ) : error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{formatValue(error)}</div>
          ) : data ? (
            <div className="overflow-hidden rounded-3xl border border-blue-100 bg-white shadow-[0_12px_30px_rgba(15,23,42,0.08)]">
              <table className="w-full border-collapse text-sm">
                <tbody>
                  {[
                    { label: "PO Number", value: data.poNumber },
                    { label: "Approval Status", value: data.approvalStatus },
                    { label: "Delivery Status", value: data.deliveryStatus },
                    { label: "Plant", value: data.plant },
                    { label: "Net Value", value: data.netPrice },
                  ].map((field) => (
                    <tr key={field.label} className="border-b border-blue-100/80 last:border-b-0 odd:bg-white even:bg-slate-50/50">
                      <th className="w-[36%] bg-transparent px-4 py-3 text-left align-top text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">{field.label}</th>
                      <td className="px-4 py-3 align-top text-sm font-medium text-slate-900 break-words whitespace-pre-wrap">{formatValue(field.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-600">No details found.</div>
          )}
        </div>
      </aside>
    </div>
  );

  return typeof document === "undefined" ? content : createPortal(content, document.body);
}
import ReplyTable from "./ReplyTable";
import { replyToTable } from "../utils/replyToTable";

function Avatar({ role }) {
  const isUser = role === "user";
  return (
    <div
      className={[
        "h-8 w-8 shrink-0 rounded-full grid place-items-center text-xs font-bold",
        isUser ? "bg-zinc-200 text-zinc-950" : "bg-blue-600 text-white",
      ].join(" ")}
      title={isUser ? "You" : "Bot"}
    >
      {isUser ? "Y" : "B"}
    </div>
  );
}

export default function MessageBubble({ role, text, suggestions }) {
  const isUser = role === "user";

  // ✅ USER MESSAGE
  if (isUser) {
    return (
      <div className="flex items-start justify-end gap-3 w-full">
        <div className="max-w-[85%] sm:max-w-[78%] break-words whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-blue-50 px-3 py-2 sm:px-4 sm:py-3 text-sm leading-relaxed text-blue-800 shadow-sm">
          {text}
        </div>
        <Avatar role={role} />
      </div>
    );
  }

  // ✅ BOT MESSAGE (table)
  let table = null;
  try {
    table = replyToTable(text);
  } catch (e) {
    console.error("Table parse error:", e);
  }

  return (
    <div className="flex items-start justify-start gap-3 w-full">
      <Avatar role={role} />

      <div className="max-w-[95%] sm:max-w-[85%] bg-green-100 px-2 py-2 sm:px-4 sm:py-3 rounded-2xl shadow-sm text-green-900 overflow-hidden">
        
        {/* ✅ TABLE OR TEXT */}
        {table?.columns && table?.rows ? (
          <ReplyTable columns={table.columns} rows={table.rows} />
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm">
            {text}
          </div>
        )}

        {/* ✅ 🔥 SUGGESTIONS BUTTONS */}
        {suggestions && suggestions.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-3">
            {suggestions.map((s, i) => (
              <button
                key={i}
                onClick={() =>
                  window.dispatchEvent(
                    new CustomEvent("sendMessage", { detail: s })
                  )
                }
                className="px-3 py-1 text-sm bg-white border border-green-400 text-green-800 rounded-lg hover:bg-green-200 transition"
              >
                {s}
              </button>
            ))}
          </div>
        )}

      </div>
    </div>
  );
}
import ReplyTable from "./ReplyTable";
import { replyToTable } from "../utils/replyToTable";

function Avatar({ role }) {
  const isUser = role === "user";

  // ✅ USER AVATAR
  if (isUser) {
    return (
      <div
        className="h-8 w-8 shrink-0 rounded-full grid place-items-center text-xs font-bold bg-blue-600 text-white"
        title="user"
      >
        Y
      </div>
    );
  }

  // ✅ BOT MP4 AVATAR
  return (
    <div
      className="h-10 w-10 shrink-0 rounded-full overflow-hidden bg-white"
      title="Bot"
    >
      <video
        src="/bot.mp4"
        autoPlay
        muted
        loop
        playsInline
        className="h-full w-full object-cover"
      />
    </div>
  );
}

// normalize text to handle single-line multi-item issue
function formatText(text = "") {
  const t = String(text || "").trim();

  // If no newline but multiple "Item", split it
  if (!t.includes("\n") && t.includes("Item")) {
    return t
      .split(/(?=Item\s+\d+)/g)
      .map((l) => l.trim())
      .join("\n");
  }

  return t;
}

export default function MessageBubble({
  role,
  text,
  suggestions,
  onSuggestionClick,
}) {
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

  const formattedText = formatText(text);

  // ✅ BOT MESSAGE (table)
  let table = null;

  try {
    table = replyToTable(formattedText);
  } catch (e) {
    console.error("Table parse error:", e);
  }

  const hasTable = Boolean(table?.columns && table?.rows);

  const totalRows = Number(table?._meta?.totalRows || 0);
  const cappedTo = Number(table?._meta?.cappedTo || 0);
  const isCapped =
    totalRows > 0 &&
    cappedTo > 0 &&
    totalRows > cappedTo;

  return (
    <div className="flex items-start justify-start gap-3 w-full">
      <Avatar role={role} />

      <div className="max-w-[95%] sm:max-w-[100%] bg-green-100 px-2 py-2 sm:px-4 sm:py-3 rounded-2xl shadow-sm text-green-900 overflow-hidden">
        {/* ✅ TABLE OR TEXT */}
        {hasTable ? (
          <>
            {isCapped && (
              <div className="mb-2 text-xs text-zinc-700">
                Showing {cappedTo} of {totalRows} rows.
                Refine your query (or use top 10).
              </div>
            )}

            <ReplyTable
              columns={table.columns}
              rows={table.rows}
            />
          </>
        ) : (
          <div className="whitespace-pre-wrap break-words text-sm">
            {formattedText}
          </div>
        )}

        
      </div>
    </div>
  );
}
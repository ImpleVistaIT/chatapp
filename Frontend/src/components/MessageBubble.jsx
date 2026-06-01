import ReplyTable from "./ReplyTable";
import { replyToTable } from "../utils/replyToTable";

// =========================
// AVATAR
// =========================
function Avatar({ role, showAvatar = true }) {
  const isUser = role === "user";

  if (!showAvatar) {
    return <div className="w-10 shrink-0" />;
  }

  if (isUser) {
    return null;
  }

  return (
    <div
      className="relative h-10 w-10 shrink-0 overflow-hidden rounded-full bg-white shadow-sm"
      title="Bot"
    >
      <video
        src="/bot.mp4"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        className="h-full w-full object-cover scale-110"
      />
    </div>
  );
}

// =========================
// FORMAT TEXT
// =========================
function formatText(text = "") {
  const t = String(text || "").trim();

  if (!t.includes("\n") && t.includes("Item")) {
    return t
      .split(/(?=Item\s+\d+)/g)
      .map((l) => l.trim())
      .join("\n");
  }

  return t;
}

function getSuggestionLabel(suggestion) {
  if (typeof suggestion === "string") return suggestion;
  if (suggestion && typeof suggestion === "object") {
    return (
      suggestion.label ||
      suggestion.text ||
      suggestion?.action?.label ||
      "Action"
    );
  }
  return "";
}

function buildStructuredTable(data) {
  if (!data || data.viewType !== "transport_list_table") return null;

  const columns = Array.isArray(data.columns) ? data.columns : [];
  const rawRows = Array.isArray(data.tableRows) ? data.tableRows : [];

  if (!columns.length || !rawRows.length) return null;

  const rows = rawRows.map((row) => [
    row.no ?? "-",
    row.transport ?? "-",
    row.description ?? "-",
    row.owner ?? "-",
    row.transportType ?? "-",
    row.task ?? "-",
    row.taskOwner ?? "-",
    row.taskType ?? "-",
    row.devCreated ?? "-",
    row.devReleased ?? "-",
    row.taskReleased ?? "-",
  ]);

  return {
    columns,
    rows,
    forceGrid: true,
    _meta: {
      totalRows: rawRows.length,
      cappedTo: rawRows.length,
    },
  };
}

export default function MessageBubble({
  role,
  text,
  data,
  suggestions,
  onSuggestionClick,
  showAvatar = true,
}) {
  const isUser = role === "user";

  if (isUser) {
    return (
      <div className="flex items-start justify-end w-full">
        <div className="max-w-[85%] sm:max-w-[78%] break-words whitespace-pre-wrap rounded-2xl rounded-tr-sm bg-blue-50 px-4 py-3 text-sm leading-relaxed text-blue-800 shadow-sm border border-blue-100">
          {text}
        </div>
      </div>
    );
  }

  const formattedText = formatText(text);

  let table = buildStructuredTable(data);

  if (!table) {
    try {
      table = replyToTable(formattedText);
    } catch (e) {
      console.error("Table parse error:", e);
    }
  }

  const hasTable = Boolean(table?.columns && table?.rows);

  const totalRows = Number(table?._meta?.totalRows || 0);
  const cappedTo = Number(table?._meta?.cappedTo || 0);

  const isCapped =
    totalRows > 0 &&
    cappedTo > 0 &&
    totalRows > cappedTo;

  const safeSuggestions = Array.isArray(suggestions) ? suggestions : [];

  return (
    <div className="flex items-start justify-start gap-3 w-full">
      <Avatar role={role} showAvatar={showAvatar} />

      <div className="max-w-[95%] sm:max-w-full min-w-0 overflow-hidden">
        <div
          className={
            hasTable
              ? "overflow-hidden rounded-2xl rounded-tl-sm bg-green-100 text-green-900 shadow-sm border border-green-200"
              : "overflow-hidden rounded-2xl rounded-tl-sm bg-green-100 px-4 py-3 text-sm text-green-900 shadow-sm border border-green-200"
          }
        >
          {hasTable ? (
            <>
              {isCapped && (
                <div className="px-4 pt-3 text-xs text-zinc-700">
                  Showing {cappedTo} of {totalRows} rows.
                  Refine your query (or use top 10).
                </div>
              )}

              <ReplyTable
                columns={table.columns}
                rows={table.rows}
                forceGrid={Boolean(table?.forceGrid || data?.viewType === "transport_list_table")}
              />
            </>
          ) : (
            <div className="whitespace-pre-wrap break-words leading-relaxed">
              {formattedText}
            </div>
          )}
        </div>

        {safeSuggestions.length > 0 && (
          <div className="mt-3 ml-4 flex flex-wrap gap-2">
            {safeSuggestions.map((suggestion, idx) => {
              const label = getSuggestionLabel(suggestion);
              if (!label) return null;

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => onSuggestionClick?.(suggestion)}
                  className="px-4 py-1.5 text-xs bg-white text-black border border-dashed border-green-700 rounded-full transition hover:bg-green-50"
                >
                  {label}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
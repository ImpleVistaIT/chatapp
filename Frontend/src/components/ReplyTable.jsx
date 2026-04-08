export default function ReplyTable({ columns, rows }) {
  const isMultiRow = rows.length > 1;

  // ✅ Detect fallback case (like "Output")
  const isFallback = !columns || columns.length === 0 || columns[0] === "Output";

  return (
    <div className="w-full overflow-x-auto bg-zinc-950">
      <table className="min-w-full text-left text-[11px] sm:text-xs border-collapse">

        {/* ✅ SHOW HEADER ONLY FOR REAL TABLES */}
        {!isFallback && (
          <thead className="bg-green-300 text-black font-semibold">
            <tr>
<<<<<<< HEAD
              {/* ❌ REMOVED: {isMultiRow && <th className="px-2 py-2 sm:px-3 w-6 sm:w-8">#</th>} */}
=======
              {isMultiRow && (
                <th className="px-2 py-2 sm:px-3 w-6 sm:w-8">#</th>
              )}
>>>>>>> origin/dev
              {columns.map((c) => (
                <th key={c} className="px-2 py-2 sm:px-3 border">
                  {c}
                </th>
              ))}
            </tr>
          </thead>
        )}

        {/* ✅ BODY */}
        <tbody className="text-zinc-100">
          {rows.map((row, idx) => {
            const showBorder = isMultiRow && idx !== 0;

            return (
              <tr
                key={idx}
                className={`text-green-700 bg-green-100 ${
                  showBorder ? "border-t border-green-300" : "border-0"
                }`}
              >
<<<<<<< HEAD
                {/* ❌ REMOVED: Numbering column */}
                {/* !isFallback && isMultiRow && (
                  <td className="px-2 py-2 sm:px-3 text-green-700 w-6 sm:w-8 border-0">
                    {idx + 1}
                  </td>
                ) */}
=======
                {/* ✅ Numbering ONLY for real tables */}
                {!isFallback && isMultiRow && (
                  <td className="px-2 py-2 sm:px-3 text-green-700 w-6 sm:w-8 border-0">
                    {idx + 1}
                  </td>
                )}
>>>>>>> origin/dev

                {/* ✅ DATA */}
                {!isFallback ? (
                  columns.map((c) => (
                    <td
                      key={c}
                      className="
                        px-2 py-2 
                        sm:px-3 
                        align-top 
                        whitespace-pre-wrap 
                        break-words
                        max-w-[140px] sm:max-w-none
                      "
                    >
<<<<<<< HEAD
                      {String(
                        row?.[c] ??
                        row?.[c.toLowerCase()] ??
                        row?.[c.replace(/\s/g, "")] ??
                        row?.[c.toLowerCase().replace(/\s/g, "")] ??
                        ""
                      )}
=======
                      {String(row?.[c] ?? "")}
>>>>>>> origin/dev
                    </td>
                  ))
                ) : (
                  <td className="px-3 py-2">
                    {row.Output || row.text || ""}
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>

      </table>
    </div>
  );
}
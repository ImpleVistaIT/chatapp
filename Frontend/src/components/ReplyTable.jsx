export default function ReplyTable({ columns, rows, forceGrid = false }) {
  const isFallback =
    !columns || columns.length === 0 || columns[0] === "Output";

  const safeColumns = Array.isArray(columns) ? columns : [];
  const safeRows = Array.isArray(rows) ? rows : [];

  const isSingleRow = safeRows.length === 1;

  const isSingleRecordVertical =
    !forceGrid &&
    !isFallback &&
    isSingleRow &&
    safeColumns.length > 2;

  const labelMap = {
    "#": "Serial No",
    PoNo: "PO Number",
    PoItem: "PO Item",
    ItemDeliDt: "Delivery Date",
    ShortText: "Description",
    MatNo: "Material Number",
    Plant: "Plant",
    StrLoc: "Storage Location",
    MatGrp: "Material Group",
    Menge: "Quantity",
    NetPrice: "Net Price",
    CurKey: "Currency",
  };

  if (isSingleRecordVertical) {
    const row = safeRows[0];

    return (
      <div className="w-full max-w-full overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-green-300 text-black">
              <th className="text-left px-3 py-2 border border-green-200">
                Fields
              </th>
              <th className="text-left px-3 py-2 border border-green-200">
                Values
              </th>
            </tr>
          </thead>

          <tbody>
            {safeColumns.map((col, idx) => (
              <tr
                key={idx}
                className="bg-green-100 text-green-800 border-t border-green-200"
              >
                <td className="px-3 py-2 font-semibold w-[45%] border border-green-200">
                  {labelMap[col] || col}
                </td>

                <td className="px-3 py-2 break-words border border-green-200">
                  {String(row?.[idx] ?? row?.[col] ?? "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  return (
    <div className="w-full p-1">
      {forceGrid && (
        <div className="mb-2 px-1 text-[11px] sm:text-xs text-green-800">
          Scroll horizontally to view all columns →
        </div>
      )}

      <div className="relative w-full max-w-full">
        <div className="w-full max-w-full overflow-x-auto scrollbar-none">
          <table className="w-max min-w-full text-left text-[11px] sm:text-xs border-collapse">
            {!isFallback && (
              <thead className="bg-green-300 text-black font-semibold">
                <tr>
                  {safeColumns.map((c) => (
                    <th
                      key={c}
                      className="px-3 py-3 border border-green-200 whitespace-nowrap"
                    >
                      {labelMap[c] || c}
                    </th>
                  ))}
                </tr>
              </thead>
            )}

            <tbody>
              {safeRows.map((row, idx) => (
                <tr
                  key={idx}
                  className="bg-green-100 text-green-800 border-t border-green-200"
                >
                  {!isFallback ? (
                    safeColumns.map((c, colIdx) => (
                      <td
                        key={`${c}-${colIdx}`}
                        className="px-3 py-3 whitespace-nowrap border border-green-200"
                      >
                        {String(row?.[colIdx] ?? row?.[c] ?? "")}
                      </td>
                    ))
                  ) : (
                    <td className="px-3 py-2 border border-green-200">
                      {row.Output || row.text || ""}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {forceGrid && (
          <>
            <div className="pointer-events-none absolute right-0 top-0 h-full w-12 bg-gradient-to-l from-green-100 to-transparent" />
            {/* <div className="pointer-events-none absolute right-3 top-3 text-green-700 text-sm font-semibold">
              →
            </div> */}
          </>
        )}
      </div>
    </div>
  );
}
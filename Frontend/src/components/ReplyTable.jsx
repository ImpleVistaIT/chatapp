export default function ReplyTable({ columns, rows }) {
  // console.log("TABLE DATA =", columns, rows);

  const isFallback =
    !columns || columns.length === 0 || columns[0] === "Output";

  const isSingleRow = rows?.length === 1;

  // ✅ Convert one-row many-column table into Field | Value layout
  const isSingleRecordVertical =
    !isFallback &&
    isSingleRow &&
    columns.length > 2;

  // ✅ Friendly label map
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

  // ✅ SPECIAL VIEW = FIELD NAME | FIELD VALUE
  if (isSingleRecordVertical) {
    const row = rows[0];

    return (
      <div className="w-full bg-zinc-950 rounded-xl overflow-hidden">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-green-300 text-black">
              <th className="text-left px-3 py-2 border">Fields</th>
              <th className="text-left px-3 py-2 border">Values</th>
            </tr>
          </thead>

          <tbody>
            {columns.map((col, idx) => (
              <tr
                key={idx}
                className="bg-green-100 text-green-800 border-t border-green-300"
              >
                <td className="px-3 py-2 font-semibold w-[45%]">
                  {labelMap[col] || col}
                </td>

                <td className="px-3 py-2 break-words">
                  {String(row?.[col] ?? "")}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  // ✅ NORMAL TABLE VIEW
  return (
    <div className="w-full overflow-x-auto scrollbar-none bg-zinc-950">
      <table className="min-w-full text-left text-[11px] sm:text-xs border-collapse">
        {!isFallback && (
          <thead className="bg-green-300 text-black font-semibold">
            <tr>
              {columns.map((c) => (
                <th key={c} className="px-2 py-2 border">
                  {labelMap[c] || c}
                </th>
              ))}
            </tr>
          </thead>
        )}

        <tbody>
          {rows.map((row, idx) => (
            <tr
              key={idx}
              className="bg-green-100 text-green-700 border-t border-green-300"
            >
              {!isFallback ? (
                columns.map((c) => (
                  <td key={c} className="px-2 py-2 break-words">
                    {String(row?.[c] ?? "")}
                  </td>
                ))
              ) : (
                <td className="px-3 py-2">{row.Output || row.text || ""}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
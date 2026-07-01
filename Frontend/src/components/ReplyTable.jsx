import { useEffect, useRef, useState } from "react";

export default function ReplyTable({ columns, rows, forceGrid = false }) {
  const isFallback =
    !columns || columns.length === 0 || columns[0] === "Output";

  const safeRows = Array.isArray(rows) ? rows : [];
  const scrollAreaRef = useRef(null);
  const [hasHorizontalOverflow, setHasHorizontalOverflow] = useState(false);

  function isBlankLike(value) {
    const text = String(value ?? "").trim();
    return !text || text === "-";
  }

  function getColumnValue(row, column, colIdx) {
    if (Array.isArray(row)) {
      return row[colIdx] ?? row[column] ?? "";
    }

    if (!row || typeof row !== "object") {
      return "";
    }

    const aliasMap = {
      PoNo: ["PoNo", "PO Number", "PONumber", "PO_NO"],
      PoItem: ["PoItem", "PO Item", "POItem", "PO_ITEM"],
    };

    const aliases = aliasMap[column] || [column];

    for (const key of aliases) {
      const value = row?.[key];
      if (!isBlankLike(value)) {
        return value;
      }
    }

    if (column === "PoNo" && row?.__metadata?.id) {
      const match = String(row.__metadata.id).match(/\('([^']+)'\)/);
      if (match) return match[1];
    }

    return "";
  }

  const safeColumns = Array.isArray(columns) ? columns : [];
  const visibleColumns =
    safeColumns.includes("PoNo") &&
    safeRows.length > 0 &&
    safeRows.every((row) => isBlankLike(getColumnValue(row, "PoNo", safeColumns.indexOf("PoNo"))))
      ? safeColumns.filter((column) => column !== "PoNo")
      : safeColumns;

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
    SuppAcoutNo: "Supplier Account Number",
    UserCreated: "Created By",
    CrtDate: "Created Date",
    ExcngRate: "Exchange Rate",
    Wemng: "Goods Receipt Quantity",
    CompanyCode: "Company Code",





  };

  useEffect(() => {
    const element = scrollAreaRef.current;

    if (!element) {
      return undefined;
    }

    const updateOverflow = () => {
      setHasHorizontalOverflow(element.scrollWidth > element.clientWidth + 1);
    };

    updateOverflow();

    if (typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updateOverflow);
      return () => window.removeEventListener("resize", updateOverflow);
    }

    const observer = new ResizeObserver(updateOverflow);
    observer.observe(element);

    return () => observer.disconnect();
  }, [safeColumns.length, safeRows.length, visibleColumns.length, forceGrid]);

  return (
    <div className="w-full p-1">
      {forceGrid && hasHorizontalOverflow && (
        <div className="mb-2 px-1 text-[11px] sm:text-xs text-green-800">
          Scroll horizontally to view all columns →
        </div>
      )}

      <div className="relative w-full max-w-full">
        <div ref={scrollAreaRef} className="w-full max-w-full overflow-x-auto scrollbar-none">
          <table className="w-max min-w-full text-left text-[11px] sm:text-xs border-collapse">
            {!isFallback && (
              <thead className="bg-green-300 text-black font-semibold">
                <tr>
                  {visibleColumns.map((c) => (
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
                    visibleColumns.map((c, colIdx) => (
                      <td
                        key={`${c}-${colIdx}`}
                        className="px-3 py-3 whitespace-nowrap border border-green-200"
                      >
                        {String(getColumnValue(row, c, colIdx) ?? "")}
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

        {forceGrid && hasHorizontalOverflow && (
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
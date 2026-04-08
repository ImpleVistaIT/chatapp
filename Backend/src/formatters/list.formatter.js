// formatters/list.formatter.js
export function formatList({ entity, intent, structured }) {
  const headers = structured?.headers || [];
  const page = structured?.page || null;

  const lines = headers.map((h, idx) => {
    return `${idx + 1}) PO ${h.po_no} | CC: ${h.company_code || "N/A"} | Date: ${
      h.doc_date || h.created_on || "N/A"
    } | By: ${h.created_by || "N/A"} | Vendor: ${h.vendor_id || "N/A"} | Cur: ${
      h.currency || "N/A"
    } | Status: ${h.status || "N/A"}`;
  });

  const returned = page?.returned ?? headers.length;
  const totalMatched = page?.totalMatched ?? headers.length;

  return {
    count: returned,
    totalMatched,
    lines,
    text: `${entity} LIST (returned ${returned} of ${totalMatched})\n` + lines.join("\n"),
    page, // optional: keep paging metadata for frontend
  };
}
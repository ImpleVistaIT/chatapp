function splitNonEmptyLines(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
}

function isKeyValueLine(line) {
  return /.+:\s+.+/.test(line);
}

function parseKeyValue(text) {
  const lines = splitNonEmptyLines(text);
  const rows = [];

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = line.slice(0, idx).trim();
    const value = line.slice(idx + 1).trim();
    if (key && value) rows.push({ Field: key, Value: value });
  }

  if (rows.length >= 2) {
    return { columns: ["Field", "Value"], rows };
  }
  return null;
}

function parsePipeTable(text) {
  try {
    const lines = splitNonEmptyLines(text);
    const pipeLines = lines.filter((l) => l.includes("|"));

    if (pipeLines.length < 2) return null;

    const firstLine = pipeLines[0];

    const isDataRow = /^\d+\)\s*PO/.test(firstLine);

    let header;
    let dataLines;

    if (isDataRow) {
      header = ["PO Number", "Purchase Date", "Created By", "Vendor", "Currency", "Status"];
      dataLines = pipeLines;
    } else {
      header = firstLine.split("|").map((x) => x.trim()).filter(Boolean);
      dataLines = pipeLines.slice(1);
    }

    if (!header || header.length < 2) return null;

    const rows = dataLines.map((line) => {
  const cells = line.split("|").map((x) => x.trim());

  return {
    "PO Number": cells[0]?.replace(/^\d+\)\s*PO\s*/, "") || "",
    "Purchase Date": cells[1]?.replace("Date:", "").trim() || "",
    "Created By": cells[2]?.replace("By:", "").trim() || "",
    "Vendor": cells[3]?.replace("Vendor:", "").trim() || "",
    "Currency": cells[4]?.replace("Cur:", "").trim() || "",
    "Status": cells[5]?.replace("Status:", "").trim() || "",
  };
});
    return { columns: header, rows };
  } catch (e) {
    console.error("parsePipeTable error:", e);
    return null;
  }
}

function parseBullets(text) {
  const lines = splitNonEmptyLines(text);
  const bullets = lines
    .filter(
      (l) =>
        l.startsWith("-") ||
        l.startsWith("•") ||
        l.startsWith("📋") ||
        l.startsWith("✅") ||
        l.startsWith("❌") ||
        l.startsWith("⚠️")
    )
    .map((l) => l.replace(/^[-•]\s*/, "").trim());

  if (bullets.length >= 2) {
    return { columns: ["Item"], rows: bullets.map((b) => ({ Item: b })) };
  }
  return null;
}

// ✅ FINAL FUNCTION
export function replyToTable(replyText) {
  const text = String(replyText ?? "");

  // ✅ IMPORTANT FIX: DO NOT convert PO ITEMS to table
  if (text.includes("PO Item:")) {
    return null;
  }

  // Prefer real tables first
  const pipe = parsePipeTable(text);
  if (pipe) return pipe;

  // Key-value format
  const kv = parseKeyValue(text);
  if (kv) return kv;

  // Bullets
  const bullets = parseBullets(text);
  if (bullets) return bullets;

  // Fallback
const lines = splitNonEmptyLines(text);

if (lines.length > 1) {
  return {
    columns: [],   
    rows: lines.map((l) => ({ text: l })),
  };
}

return {
  columns: [],
  rows: [{ text: text.trim() || "-" }],
};}
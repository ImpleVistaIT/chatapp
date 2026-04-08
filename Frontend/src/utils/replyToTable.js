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

// ✅ HELPER FUNCTION: normalize field names
function normalizeFieldName(fieldName) {
  return String(fieldName || "")
    .replace(/^by$/i, "Created By")    // Replace "by" with "Created By"
    .trim();
}

function parsePipeTable(text) {
  try {
    const lines = splitNonEmptyLines(text);
    const pipeLines = lines.filter((l) => l.includes("|"));

    if (pipeLines.length < 1) return null;

    const firstLine = pipeLines[0];
    const isDataRow = /^\d+\)\s*PO/.test(firstLine);

    let header;
    let dataLines;

    if (isDataRow) {
      // ✅ DYNAMIC: Extract header from first data line
      // Format: "1) PO 4500001933 | CC: 1710 | Date: 2026-01-21 | By: S4H_MM_DEM | Vendor: N/A | Cur: N/A | Status: 9"
      
      const firstCells = firstLine.split("|").map((x) => x.trim());
      header = [];

      // First cell: "1) PO 4500001933" -> "SL.No" and "PO Number"
      if (/^\d+\)\s*PO/.test(firstCells[0])) {
        header.push("SL.No");
        header.push("PO Number");
      }

      // Remaining cells: extract key from "Key: value" format
      for (let i = 1; i < firstCells.length; i++) {
        const cell = firstCells[i];
        const colonIdx = cell.indexOf(":");
        if (colonIdx > -1) {
          const key = cell.slice(0, colonIdx).trim();
          header.push(normalizeFieldName(key));
        } else {
          header.push(normalizeFieldName(`Column ${i}`));
        }
      }

      dataLines = pipeLines;
    } else {
      // For non-PO tables: use first line as header
      header = firstLine
        .split("|")
        .map((x) => x.trim())
        .filter(Boolean)
        .map(normalizeFieldName);
      dataLines = pipeLines.slice(1);
    }

    if (!header || header.length < 1) return null;

    const rows = dataLines.map((line, rowIndex) => {
      const cells = line.split("|").map((x) => x.trim());
      const row = {};

      // First cell: extract serial number AND PO number from "1) PO 4500001933"
      if (isDataRow) {
        const slMatch = cells[0]?.match(/^(\d+)\)/);
        const poMatch = cells[0]?.match(/^\d+\)\s*PO\s*(\d+)/);
        
        row[header[0]] = slMatch ? slMatch[1] : (rowIndex + 1).toString();  // SL.No
        row[header[1]] = poMatch ? poMatch[1] : "";  // PO Number
      } else {
        row[header[0]] = cells[0] || "";
      }

      // Remaining cells: extract value after colon
      // Start from index 2 because we now have 2 columns from first cell
      for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];
        const colonIdx = cell.indexOf(":");
        const headerIndex = isDataRow ? i + 1 : i;  // Adjust for extra PO Number column
        
        if (headerIndex < header.length) {
          if (colonIdx > -1) {
            const value = cell.slice(colonIdx + 1).trim();
            row[header[headerIndex]] = value;
          } else {
            row[header[headerIndex]] = cell;
          }
        }
      }

      return row;
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

function parseMeasuresLines(text) {
  const lines = splitNonEmptyLines(text);
  const rows = [];

  for (const line of lines) {
    const m = line.match(/^Item\s+(\d+)\s*->\s*(.+)$/i);
    if (!m) continue;

    const item = m[1];
    const rest = m[2];

    const parts = rest.split("|").map((x) => x.trim()).filter(Boolean);

    let gross = "";
    let net = "";
    let vol = "";

    for (const p of parts) {
      const idx = p.indexOf(":");
      if (idx === -1) continue;

      const k = p.slice(0, idx).trim().toLowerCase();
      const v = p.slice(idx + 1).trim();

      if (k.startsWith("gross weight")) gross = v;
      else if (k.startsWith("net weight")) net = v;
      else if (k === "volume") vol = v;
    }

    rows.push({
      Item: item,
      "Gross weight": gross,
      "Net weight": net,
      Volume: vol,
    });
  }

  if (rows.length >= 2) {
    return {
      columns: ["Item", "Gross weight", "Net weight", "Volume"],
      rows,
    };
  }
  return null;
}

// ✅ FINAL EXPORT FUNCTION
export function replyToTable(replyText) {
  const text = String(replyText ?? "");

  // ✅ IMPORTANT FIX: DO NOT convert PO ITEMS to table
  if (text.includes("PO Item:")) {
    return null;
  }

  // ✅ Measures table (must be before generic fallback)
  const measures = parseMeasuresLines(text);
  if (measures) return measures;

  // Prefer real tables first
  const pipe = parsePipeTable(text);
  if (pipe) return pipe;

  // 🔥 FIX: detect SAP multi-item structured response
const isSAPItemBlock =
  text.includes("Po Item") &&
  text.includes("Material") &&
  text.includes("Item");

if (isSAPItemBlock) {
  return {
    columns: [],
    rows: splitNonEmptyLines(text).map((l) => ({ text: l })),
  };
}

  // Key-value format
  const kv = parseKeyValue(text);
  if (kv) return kv;

  // Bullets
  const bullets = parseBullets(text);
  if (bullets) return bullets;

  // Fallback: multi-line -> simple rows
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
  };
}

//manas code
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

// ✅ split key/value tokens from ONE-LINE pipe responses into separate "lines"
function splitKeyValueTokens(text = "") {
  return String(text)
    .replace(/\r/g, "")
    .split("|")
    .map((x) => x.trim())
    .filter(Boolean);
}

// ✅ HELPER FUNCTION: normalize field names
function normalizeFieldName(fieldName) {
  return String(fieldName || "")
    .replace(/^by$/i, "Created By")
    .trim();
}

function parseKeyValue(text) {
  // ✅ support both newline key/value AND one-line pipe key/value
  const rawLines = splitNonEmptyLines(text);
  const lines =
    rawLines.length === 1 && rawLines[0].includes("|")
      ? splitKeyValueTokens(rawLines[0])
      : rawLines;

  const rows = [];

  for (const line of lines) {
    const idx = line.indexOf(":");
    if (idx === -1) continue;
    const key = normalizeFieldName(line.slice(0, idx).trim());
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

    if (pipeLines.length < 1) return null;

    // ✅ IMPORTANT: If it's ONLY ONE LINE with pipes, DON'T render horizontal table.
    // We want that case to be handled as vertical KV.
    if (pipeLines.length === 1) return null;

    const firstLine = pipeLines[0];
    const isDataRow = /^\d+\)\s*PO/.test(firstLine);

    let header;
    let dataLines;

    if (isDataRow) {
      const firstCells = firstLine.split("|").map((x) => x.trim());
      header = [];

      if (/^\d+\)\s*PO/.test(firstCells[0])) {
        header.push("SL.No");
        header.push("PO Number");
      }

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

      if (isDataRow) {
        const slMatch = cells[0]?.match(/^(\d+)\)/);
        const poMatch = cells[0]?.match(/^\d+\)\s*PO\s*(\d+)/);

        row[header[0]] = slMatch ? slMatch[1] : (rowIndex + 1).toString();
        row[header[1]] = poMatch ? poMatch[1] : "";
      } else {
        row[header[0]] = cells[0] || "";
      }

      for (let i = 1; i < cells.length; i++) {
        const cell = cells[i];
        const colonIdx = cell.indexOf(":");
        const headerIndex = isDataRow ? i + 1 : i;

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
  const lines = splitNonEmptyLines(text);

  // ✅ if completely empty, don't show table / green box
  if (!text.trim()) {
    return null;
  }

  // ✅ IMPORTANT FIX: DO NOT convert PO ITEMS to table
  if (text.includes("PO Item:")) {
    return null;
  }

  // ✅ Measures table (must be before generic fallback)
  const measures = parseMeasuresLines(text);
  if (measures) return measures;

  // ✅ FORCE VERTICAL for ONE-LINE pipe key/value
  // Example:
  // CC: 1710 | Date: 2026-01-21 | By: USER1 | Status: 9
  const isSingleLinePipe =
    lines.length === 1 && lines[0].includes("|");

  if (isSingleLinePipe) {
    const parts = splitKeyValueTokens(lines[0]);
    const kvParts = parts.filter(isKeyValueLine);

    if (kvParts.length >= 2) {
      const rows = kvParts
        .map((p) => {
          const idx = p.indexOf(":");
          const key = normalizeFieldName(
            p.slice(0, idx).trim()
          );

          const value =
            p.slice(idx + 1).trim() || "-";

          return key
            ? { Field: key, Value: value }
            : null;
        })
        .filter(Boolean);

      if (rows.length >= 2) {
        return {
          columns: ["Field", "Value"],
          rows,
        };
      }
    }
  }

  // ✅ Prefer real tables (multi-line)
  const pipe = parsePipeTable(text);
  if (pipe) return pipe;

  // 🔥 SAP multi-item structured response
  const isSAPItemBlock =
    text.includes("Po Item") &&
    text.includes("Material") &&
    text.includes("Item");

  if (isSAPItemBlock) {
    return {
      columns: [],
      rows: splitNonEmptyLines(text).map((l) => ({
        text: l,
      })),
    };
  }

  // ✅ Key-value format (newline OR fallback)
  const kv = parseKeyValue(text);
  if (kv) return kv;

  // ✅ Bullets
  const bullets = parseBullets(text);
  if (bullets) return bullets;

  // ✅ Multi-line plain text
  if (lines.length > 1) {
    return {
      columns: [],
      rows: lines.map((l) => ({
        text: l,
      })),
    };
  }

  // ✅ Single text only (normal text message)
  return {
    columns: [],
    rows: [
      {
        text: text.trim(),
      },
    ],
  };
}
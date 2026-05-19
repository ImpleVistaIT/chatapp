// ------------------------
// Reply formatting
// ------------------------
export function na(v) {
  if (v == null) return "N/A";
  if (typeof v === "string") {
    const s = v.trim();
    return s === "" ? "N/A" : s;
  }
  return String(v);
}

export function formatFieldName(fieldName) {
  return String(fieldName || "")
    .replace(/^_+/, "")
    .replace(/__/g, "_")
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export function computeTableColumns({ rows = [], fields = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  const first = rows[0] && typeof rows[0] === "object" ? rows[0] : {};
  const keys = Object.keys(first).filter((k) => k !== "__metadata");

  const base = Array.isArray(fields) && fields.length > 0 ? fields.filter((f) => keys.includes(f)) : [];

  const common = ["CrtDate", "UserCreated", "SuppAcoutNo", "NetPrice", "CurKey"].filter((k) => keys.includes(k));
  const baseOrCommon = base.length > 0 ? base : common.length > 0 ? common : keys.slice(0, 8);

  const mandatoryIds = [
    ...(keys.includes("PoNo") ? ["PoNo"] : []),
    ...(keys.includes("PoItem") ? ["PoItem"] : []),
  ];

  return Array.from(new Set([...mandatoryIds, ...baseOrCommon]));
}

export function buildGenericTableReply({ title = "Results", rows = [], fields = [] }) {
  if (!Array.isArray(rows) || rows.length === 0) return "No results found.";

  const first = rows[0] && typeof rows[0] === "object" ? rows[0] : {};
  const keys = Object.keys(first).filter((k) => k !== "__metadata");

  const base = Array.isArray(fields) && fields.length > 0 ? fields.filter((f) => keys.includes(f)) : [];

  const common = ["CrtDate", "UserCreated", "SuppAcoutNo", "NetPrice", "CurKey"].filter((k) => keys.includes(k));
  const baseOrCommon = base.length > 0 ? base : common.length > 0 ? common : keys.slice(0, 8);

  const mandatoryIds = [
    ...(keys.includes("PoNo") ? ["PoNo"] : []),
    ...(keys.includes("PoItem") ? ["PoItem"] : []),
  ];

  const cols = Array.from(new Set([...mandatoryIds, ...baseOrCommon]));

  const headerRow = ["#", ...cols.map((c) => formatFieldName(c))].join(" | ");
  const dataRows = rows.map((r, i) => [i + 1, ...cols.map((k) => na(r?.[k]))].join(" | "));

  return `${title} (returned ${rows.length})\n\n${headerRow}\n${dataRows.join("\n")}`;
}
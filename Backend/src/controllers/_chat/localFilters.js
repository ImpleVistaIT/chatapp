// // ------------------------
// // Local filtering helpers
// // ------------------------
// export function parseComparableValue(type, value) {
//   if (type === "number") {
//     const n = Number(value);
//     return Number.isFinite(n) ? n : null;
//   }
//   if (type === "datetime") {
//     const s0 = String(value || "").trim();
//     if (!s0) return null;

//     const dateOnly = s0.includes("T") ? s0.split("T")[0] : s0;
//     const t = Date.parse(`${dateOnly}T00:00:00Z`);
//     return Number.isFinite(t) ? t : null;
//   }
//   if (type === "boolean") {
//     if (value === true || value === "true") return true;
//     if (value === false || value === "false") return false;
//     return null;
//   }
//   return String(value ?? "");
// }

// export function getRowFieldValue(row, field, type) {
//   const raw = row?.[field];
//   if (raw == null) return null;

//   if (type === "number") {
//     const n = Number(raw);
//     return Number.isFinite(n) ? n : null;
//   }
//   if (type === "datetime") {
//     const s0 = String(raw).trim();
//     if (!s0) return null;

//     if (/^\/Date\(\d+\)\/$/.test(s0)) {
//       const ms = Number(s0.replace(/[^\d]/g, ""));
//       return Number.isFinite(ms) ? ms : null;
//     }

//     const dateOnly = s0.includes("T") ? s0.split("T")[0] : s0;
//     const t = Date.parse(`${dateOnly}T00:00:00Z`);
//     return Number.isFinite(t) ? t : null;
//   }
//   if (type === "boolean") {
//     if (raw === true || raw === "true") return true;
//     if (raw === false || raw === "false") return false;
//     return null;
//   }
//   return String(raw);
// }

// export function applyOp(left, op, right) {
//   if (left == null || right == null) return false;
//   switch (op) {
//     case "eq":
//       return left === right;
//     case "ne":
//       return left !== right;
//     case "gt":
//       return left > right;
//     case "ge":
//       return left >= right;
//     case "lt":
//       return left < right;
//     case "le":
//       return left <= right;
//     default:
//       return true;
//   }
// }

// export function applyFiltersLocally(rows, filters) {
//   const fs = Array.isArray(filters) ? filters : [];
//   if (fs.length === 0) return rows;

//   return rows.filter((r) => {
//     for (const f of fs) {
//       if (!f?.field || !f?.op) continue;
//       const type = f.type || "string";
//       const left = getRowFieldValue(r, f.field, type);
//       const right = parseComparableValue(type, f.value);
//       if (!applyOp(left, f.op, right)) return false;
//     }
//     return true;
//   });
// }
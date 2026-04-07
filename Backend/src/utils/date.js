export function toISODate(value) {
  if (!value) return null;

  // if already ISO-ish
  const s = String(value);

  // SAP may send "2017-10-30T00:00:00"
  if (s.includes("T") && /^\d{4}-\d{2}-\d{2}T/.test(s)) return s.slice(0, 10);

  // if plain date
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;

  // last resort
  const d = new Date(s);
  if (!Number.isNaN(d.getTime())) return d.toISOString().slice(0, 10);

  return null;
}
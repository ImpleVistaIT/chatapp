function pad2(n) {
  return String(n).padStart(2, "0");
}

export function formatSapYmd(date) {
  return `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;
}

export function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function endOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d, days) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function startOfWeek(d) {
  const x = startOfDay(d);
  const day = x.getDay(); // 0=Sun, 1=Mon
  const diff = day === 0 ? -6 : 1 - day; // Monday start
  return addDays(x, diff);
}

export function parseUserDate(input) {
  const s = String(input || "").trim();

  if (!s) return null;

  // yyyy-mm-dd
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // yyyy/mm/dd
  m = /^(\d{4})\/(\d{2})\/(\d{2})$/.exec(s);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));

  // dd-mm-yyyy
  m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  // dd/mm/yyyy
  m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(s);
  if (m) return new Date(Number(m[3]), Number(m[2]) - 1, Number(m[1]));

  const native = new Date(s);
  return Number.isNaN(native.getTime()) ? null : native;
}

export function resolveDateRangeFromText(text, now = new Date()) {
  const q = String(text || "").trim().toLowerCase();
  const today = startOfDay(now);

  if (q.includes("today")) {
    return { from: today, to: today };
  }

  if (q.includes("yesterday")) {
    const y = addDays(today, -1);
    return { from: y, to: y };
  }

  if (q.includes("this week")) {
    return { from: startOfWeek(today), to: today };
  }

  let m = q.match(/last\s+(\d+)\s+days?/);
  if (m) {
    const n = Number(m[1]);
    return { from: addDays(today, -(n - 1)), to: today };
  }

  m = q.match(/last\s+(\d+)\s+cr/);
  if (m) {
    return { kind: "lastN", count: Number(m[1]) };
  }

  m = q.match(/(?:from|created from)\s+(.+?)\s+(?:to|-)\s+(.+)/);
  if (m) {
    const from = parseUserDate(m[1]);
    const to = parseUserDate(m[2]);
    if (from && to) return { from: startOfDay(from), to: startOfDay(to) };
  }

  m = q.match(/(?:from|created from)\s+(.+?)\s+today/);
  if (m) {
    const from = parseUserDate(m[1]);
    if (from) return { from: startOfDay(from), to: today };
  }

  m = q.match(/created\s+on\s+(.+)/);
  if (m) {
    const d = parseUserDate(m[1]);
    if (d) return { from: startOfDay(d), to: startOfDay(d) };
  }

  const direct = parseUserDate(q);
  if (direct) {
    return { from: startOfDay(direct), to: startOfDay(direct) };
  }

  return null;
}
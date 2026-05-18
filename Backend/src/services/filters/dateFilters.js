import { normalizeText, tokenize } from "./text.js";

function getTodayLocalDate() {
  const fixed = process.env.FIXED_TODAY;
  if (fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed)) return new Date(`${fixed}T00:00:00`);
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function isoDateOnlyLocal(d) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function isoDateTimeStartLocal(d) {
  return `${isoDateOnlyLocal(d)}T00:00:00`;
}

function addDaysLocal(d, days) {
  const x = new Date(d.getTime());
  x.setDate(x.getDate() + days);
  return x;
}

function startOfYearLocal(year) {
  return new Date(year, 0, 1);
}

function startOfMonthLocal(year, monthIndex0) {
  return new Date(year, monthIndex0, 1);
}

function monthNameToIndex0(token) {
  const t = String(token || "").toLowerCase();
  const map = new Map([
    ["jan", 0],
    ["january", 0],
    ["feb", 1],
    ["february", 1],
    ["febaury", 1],
    ["mar", 2],
    ["march", 2],
    ["apr", 3],
    ["april", 3],
    ["may", 4],
    ["jun", 5],
    ["june", 5],
    ["jul", 6],
    ["july", 6],
    ["aug", 7],
    ["august", 7],
    ["sep", 8],
    ["sept", 8],
    ["september", 8],
    ["oct", 9],
    ["october", 9],
    ["nov", 10],
    ["november", 10],
    ["dec", 11],
    ["december", 11],
  ]);
  return map.has(t) ? map.get(t) : null;
}

function clampYear(y) {
  const year = Number(y);
  if (!Number.isFinite(year)) return null;
  if (year < 1900 || year > 2099) return null;
  return year;
}

/**
 * Extract date filters for a target SAP date field.
 * Returns:
 * [{ field, op:"ge|lt", value:"YYYY-MM-DDT00:00:00", type:"datetime" }]
 *
 * Supports:
 * - year only: "2015", "2026"
 * - month: "june", "june 2015"
 * - exact: "2019-10-15", "15/10/2019", "10/15/2019", "15 oct 2019"
 * - relative: today, yesterday, last week/month/year
 */
export function extractDateFilters(message, field = "PoDocDate") {
  const m = normalizeText(message);
  const today = getTodayLocalDate();

  const range = (start, end) => [
    { field, op: "ge", value: isoDateTimeStartLocal(start), type: "datetime" },
    { field, op: "lt", value: isoDateTimeStartLocal(end), type: "datetime" },
  ];

  const hasExplicitIsoDate = /\b(19|20)\d{2}-\d{2}-\d{2}\b/.test(m);
  const hasSlashDate = /\b\d{1,2}[\/\-]\d{1,2}[\/\-](19|20)\d{2}\b/.test(m);
  const hasYearOnly = /\b(19\d{2}|20\d{2})\b/.test(m);
  const hasMonthName =
    /\b(jan|january|feb|february|febaury|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\b/.test(
      m
    );
  const hasRelative =
    /\b(yesterday|today|last\s+week|previous\s+week|last\s+month|previous\s+month|last\s+year|previous\s+year)\b/.test(
      m
    );
  const hasDateWords = /\b(created|create|creation|crtdate|crtd|date|dated|document\s+date|po\s+date)\b/.test(m);

  if (!(hasDateWords || hasExplicitIsoDate || hasSlashDate || hasYearOnly || hasMonthName || hasRelative)) {
    return [];
  }

  const isoMatch = m.match(/\b((?:19|20)\d{2})-(\d{2})-(\d{2})\b/);
  if (isoMatch) {
    const yyyy = clampYear(isoMatch[1]);
    const mm = Number(isoMatch[2]);
    const dd = Number(isoMatch[3]);
    if (yyyy != null && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const start = new Date(yyyy, mm - 1, dd);
      return range(start, addDaysLocal(start, 1));
    }
  }

  const slashMatch = m.match(/\b(\d{1,2})[\/\-](\d{1,2})[\/\-]((?:19|20)\d{2})\b/);
  if (slashMatch) {
    const a = Number(slashMatch[1]);
    const b = Number(slashMatch[2]);
    const yyyy = clampYear(slashMatch[3]);

    let dd;
    let mm;

    if (a > 12) {
      dd = a;
      mm = b;
    } else if (b > 12) {
      dd = b;
      mm = a;
    } else {
      dd = a;
      mm = b;
    }

    if (yyyy != null && mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) {
      const start = new Date(yyyy, mm - 1, dd);
      return range(start, addDaysLocal(start, 1));
    }
  }

  const dayMonthYear =
    m.match(
      /\b(on\s+)?(\d{1,2})(st|nd|rd|th)?\s+(jan|january|feb|february|febaury|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+((?:19|20)\d{2})\b/
    ) ||
    m.match(
      /\b(on\s+)?(jan|january|feb|february|febaury|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+(\d{1,2})(st|nd|rd|th)?\s*,?\s*((?:19|20)\d{2})\b/
    );

  if (dayMonthYear) {
    if (dayMonthYear.length >= 6 && /^\d{1,2}$/.test(dayMonthYear[2] || "")) {
      const dd = Number(dayMonthYear[2]);
      const monTok = dayMonthYear[4];
      const yyyy = clampYear(dayMonthYear[5]);
      const monthIdx = monthNameToIndex0(monTok);
      if (monthIdx != null && yyyy != null && dd >= 1 && dd <= 31) {
        const start = new Date(yyyy, monthIdx, dd);
        return range(start, addDaysLocal(start, 1));
      }
    }

    if (dayMonthYear.length >= 6 && /^\d{1,2}$/.test(dayMonthYear[3] || "")) {
      const monTok = dayMonthYear[2];
      const dd = Number(dayMonthYear[3]);
      const yyyy = clampYear(dayMonthYear[5]);
      const monthIdx = monthNameToIndex0(monTok);
      if (monthIdx != null && yyyy != null && dd >= 1 && dd <= 31) {
        const start = new Date(yyyy, monthIdx, dd);
        return range(start, addDaysLocal(start, 1));
      }
    }
  }

  if (/\byesterday\b/.test(m)) return range(addDaysLocal(today, -1), today);
  if (/\btoday\b/.test(m)) return range(today, addDaysLocal(today, 1));
  if (/\blast\s+week\b/.test(m) || /\bprevious\s+week\b/.test(m)) return range(addDaysLocal(today, -7), today);
  if (/\blast\s+month\b/.test(m) || /\bprevious\s+month\b/.test(m)) return range(addDaysLocal(today, -30), today);
  if (/\blast\s+year\b/.test(m) || /\bprevious\s+year\b/.test(m)) return range(addDaysLocal(today, -365), today);

  const tokens = tokenize(m);
  const monthToken = tokens.find((t) => monthNameToIndex0(t) != null);
  if (monthToken) {
    const monthIdx = monthNameToIndex0(monthToken);
    const yMatch = m.match(/\b(19\d{2}|20\d{2})\b/);
    const year = yMatch?.[1] ? clampYear(yMatch[1]) : today.getFullYear();

    const start = startOfMonthLocal(year, monthIdx);
    const end = startOfMonthLocal(monthIdx === 11 ? year + 1 : year, monthIdx === 11 ? 0 : monthIdx + 1);
    return range(start, end);
  }

  const yearOnlyMatch = m.match(/\b(19\d{2}|20\d{2})\b/);
  if (yearOnlyMatch?.[1] && !hasExplicitIsoDate && !hasSlashDate) {
    const year = clampYear(yearOnlyMatch[1]);
    if (year != null) {
      return range(startOfYearLocal(year), startOfYearLocal(year + 1));
    }
  }

  return [];
}

// backward compatibility
export function extractCreatedDateFilters(message, field = "PoDocDate") {
  return extractDateFilters(message, field);
}
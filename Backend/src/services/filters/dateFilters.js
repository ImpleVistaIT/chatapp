import { normalizeText } from "./text.js";

const DAY_MS = 24 * 60 * 60 * 1000;

function pad2(value) {
  return String(value).padStart(2, "0");
}

function getTodayUtcDate() {
  const fixed = process.env.FIXED_TODAY;
  if (fixed && /^\d{4}-\d{2}-\d{2}$/.test(fixed)) {
    return new Date(`${fixed}T00:00:00Z`);
  }

  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

function makeUtcDate(year, monthIndex0, day) {
  return new Date(Date.UTC(year, monthIndex0, day));
}

function isValidUtcDate(year, monthIndex0, day) {
  const date = makeUtcDate(year, monthIndex0, day);
  return date.getUTCFullYear() === year && date.getUTCMonth() === monthIndex0 && date.getUTCDate() === day;
}

function addUtcDays(date, days) {
  return new Date(date.getTime() + days * DAY_MS);
}

function startOfMonth(year, monthIndex0) {
  return makeUtcDate(year, monthIndex0, 1);
}

function startOfYear(year) {
  return makeUtcDate(year, 0, 1);
}

function startOfQuarter(year, quarter) {
  return makeUtcDate(year, (quarter - 1) * 3, 1);
}

function nextQuarterStart(year, quarter) {
  return quarter === 4 ? startOfYear(year + 1) : startOfQuarter(year, quarter + 1);
}

function toStartString(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T00:00:00`;
}

function toEndOfDayString(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(date.getUTCDate())}T23:59:59`;
}

function monthNameToIndex0(token) {
  const value = String(token || "").toLowerCase();
  const months = {
    jan: 0,
    january: 0,
    feb: 1,
    february: 1,
    febaury: 1,
    mar: 2,
    march: 2,
    apr: 3,
    april: 3,
    may: 4,
    jun: 5,
    june: 5,
    jul: 6,
    july: 6,
    aug: 7,
    august: 7,
    sep: 8,
    sept: 8,
    september: 8,
    oct: 9,
    october: 9,
    nov: 10,
    november: 10,
    dec: 11,
    december: 11,
  };
  return Object.prototype.hasOwnProperty.call(months, value) ? months[value] : null;
}

function parseYear(value) {
  const year = Number(value);
  if (!Number.isFinite(year) || year < 1900 || year > 2099) return null;
  return year;
}

function normalizeDateResult(type, startDate, endDate, confidence = 0.99) {
  return { type, startDate, endDate, confidence };
}

function parseExactDateToken(token) {
  const value = String(token || "").trim();
  if (!value) return null;

  let match = value.match(/^((?:19|20)\d{2})-(\d{2})-(\d{2})$/);
  if (match) {
    const year = parseYear(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year != null && isValidUtcDate(year, month - 1, day)) {
      const start = makeUtcDate(year, month - 1, day);
      return normalizeDateResult("exact_date", toStartString(start), toStartString(addUtcDays(start, 1)), 1);
    }
  }

  match = value.match(/^((?:19|20)\d{2})(\d{2})(\d{2})$/);
  if (match) {
    const year = parseYear(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    if (year != null && isValidUtcDate(year, month - 1, day)) {
      const start = makeUtcDate(year, month - 1, day);
      return normalizeDateResult("exact_date", toStartString(start), toStartString(addUtcDays(start, 1)), 0.99);
    }
  }

  match = value.match(/^(\d{1,2})[-\/ ]([A-Za-z]{3,9})[-\/ ]((?:19|20)\d{2})$/);
  if (match) {
    const day = Number(match[1]);
    const monthIndex0 = monthNameToIndex0(match[2]);
    const year = parseYear(match[3]);
    if (monthIndex0 != null && year != null && isValidUtcDate(year, monthIndex0, day)) {
      const start = makeUtcDate(year, monthIndex0, day);
      return normalizeDateResult("exact_date", toStartString(start), toStartString(addUtcDays(start, 1)), 0.98);
    }
  }

  match = value.match(/^([A-Za-z]{3,9})\s+(\d{1,2})(?:st|nd|rd|th)?\s+((?:19|20)\d{2})$/i);
  if (match) {
    const monthIndex0 = monthNameToIndex0(match[1]);
    const day = Number(match[2]);
    const year = parseYear(match[3]);
    if (monthIndex0 != null && year != null && isValidUtcDate(year, monthIndex0, day)) {
      const start = makeUtcDate(year, monthIndex0, day);
      return normalizeDateResult("exact_date", toStartString(start), toStartString(addUtcDays(start, 1)), 0.98);
    }
  }

  match = value.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-]((?:19|20)\d{2})$/);
  if (match) {
    const first = Number(match[1]);
    const second = Number(match[2]);
    const year = parseYear(match[3]);
    let day = first;
    let month = second;

    if (first <= 12 && second > 12) {
      day = second;
      month = first;
    }

    if (year != null && isValidUtcDate(year, month - 1, day)) {
      const start = makeUtcDate(year, month - 1, day);
      return normalizeDateResult("exact_date", toStartString(start), toStartString(addUtcDays(start, 1)), 0.97);
    }
  }

  return null;
}

function findExactDateToken(text) {
  const value = String(text || "");
  const patterns = [
    /\b(?:19|20)\d{2}-\d{2}-\d{2}\b/,
    /\b(?:19|20)\d{2}\d{2}\d{2}\b/,
    /\b\d{1,2}[-\/ ](?:jan|january|feb|february|febaury|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)[-\/ ](?:19|20)\d{2}\b/i,
    /\b(?:jan|january|feb|february|febaury|mar|march|apr|april|may|jun|june|jul|july|aug|august|sep|sept|september|oct|october|nov|november|dec|december)\s+\d{1,2}(?:st|nd|rd|th)?\s+(?:19|20)\d{2}\b/i,
    /\b\d{1,2}[\/\-]\d{1,2}[\/\-](?:19|20)\d{2}\b/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[0]) return match[0];
  }

  return null;
}

function parseMonthExpression(message) {
  const normalized = normalizeText(message);

  let match = normalized.match(/\b([a-z]{3,9})\s+((?:19|20)\d{2})\b/);
  if (match) {
    const monthIndex0 = monthNameToIndex0(match[1]);
    const year = parseYear(match[2]);
    if (monthIndex0 != null && year != null) {
      const start = startOfMonth(year, monthIndex0);
      const end = monthIndex0 === 11 ? startOfMonth(year + 1, 0) : startOfMonth(year, monthIndex0 + 1);
      return normalizeDateResult("month", toStartString(start), toStartString(end), 0.96);
    }
  }

  match = normalized.match(/\b((?:19|20)\d{2})-(0?[1-9]|1[0-2])\b/);
  if (match) {
    const year = parseYear(match[1]);
    const month = Number(match[2]);
    if (year != null) {
      const start = startOfMonth(year, month - 1);
      const end = month === 12 ? startOfMonth(year + 1, 0) : startOfMonth(year, month);
      return normalizeDateResult("month", toStartString(start), toStartString(end), 0.95);
    }
  }

  return null;
}

function parseQuarterExpression(message) {
  const normalized = normalizeText(message);

  let match = normalized.match(/\bq([1-4])\s+((?:19|20)\d{2})\b/);
  let quarter;
  let year;

  if (match) {
    quarter = Number(match[1]);
    year = parseYear(match[2]);
  } else {
    match = normalized.match(/\b((?:19|20)\d{2})\s+q([1-4])\b/);
    if (!match) return null;
    year = parseYear(match[1]);
    quarter = Number(match[2]);
  }

  if (year == null) return null;

  const start = startOfQuarter(year, quarter);
  const end = nextQuarterStart(year, quarter);
  return normalizeDateResult("quarter", toStartString(start), toStartString(end), 0.95);
}

function parseYearExpression(message) {
  const normalized = normalizeText(message);
  const match = normalized.match(/\b((?:19|20)\d{2})\b/);
  if (!match) return null;

  const year = parseYear(match[1]);
  if (year == null) return null;

  return normalizeDateResult("year", toStartString(startOfYear(year)), toStartString(startOfYear(year + 1)), 0.9);
}

function parseRelativeExpression(message) {
  const normalized = normalizeText(message);
  const today = getTodayUtcDate();

  if (/\btoday\b/.test(normalized)) {
    return normalizeDateResult("relative", toStartString(today), toStartString(addUtcDays(today, 1)), 1);
  }

  if (/\byesterday\b/.test(normalized)) {
    const start = addUtcDays(today, -1);
    return normalizeDateResult("relative", toStartString(start), toStartString(today), 1);
  }

  const daysMatch = normalized.match(/\b(last|past|previous)\s+(\d{1,3})\s+days?\b/);
  if (daysMatch) {
    const days = Math.max(1, Math.min(365, Number(daysMatch[2])));
    const start = addUtcDays(today, -(days - 1));
    return normalizeDateResult("relative", toStartString(start), toStartString(addUtcDays(today, 1)), 0.98);
  }

  if (/\bthis\s+month\b/.test(normalized)) {
    const start = startOfMonth(today.getUTCFullYear(), today.getUTCMonth());
    const end = today.getUTCMonth() === 11 ? startOfMonth(today.getUTCFullYear() + 1, 0) : startOfMonth(today.getUTCFullYear(), today.getUTCMonth() + 1);
    return normalizeDateResult("relative", toStartString(start), toStartString(end), 0.96);
  }

  if (/\blast\s+month\b/.test(normalized)) {
    const current = startOfMonth(today.getUTCFullYear(), today.getUTCMonth());
    const previous = today.getUTCMonth() === 0 ? startOfMonth(today.getUTCFullYear() - 1, 11) : startOfMonth(today.getUTCFullYear(), today.getUTCMonth() - 1);
    return normalizeDateResult("relative", toStartString(previous), toStartString(current), 0.96);
  }

  if (/\bthis\s+year\b/.test(normalized)) {
    const start = startOfYear(today.getUTCFullYear());
    return normalizeDateResult("relative", toStartString(start), toStartString(startOfYear(today.getUTCFullYear() + 1)), 0.96);
  }

  if (/\blast\s+year\b/.test(normalized)) {
    const start = startOfYear(today.getUTCFullYear() - 1);
    return normalizeDateResult("relative", toStartString(start), toStartString(startOfYear(today.getUTCFullYear())), 0.96);
  }

  return null;
}

function parseDateRangeExpression(message) {
  const normalized = String(message || "").trim();
  const rangePatterns = [
    /\bbetween\s+(.+?)\s+and\s+(.+)$/i,
    /\bfrom\s+(.+?)\s+to\s+(.+)$/i,
  ];

  for (const pattern of rangePatterns) {
    const match = normalized.match(pattern);
    if (!match) continue;

    const start = parseExactDateToken(match[1].trim()) || parseMonthExpression(match[1].trim()) || parseQuarterExpression(match[1].trim()) || parseYearExpression(match[1].trim()) || parseRelativeExpression(match[1].trim());
    const end = parseExactDateToken(match[2].trim()) || parseMonthExpression(match[2].trim()) || parseQuarterExpression(match[2].trim()) || parseYearExpression(match[2].trim()) || parseRelativeExpression(match[2].trim());
    if (!start || !end) continue;

    return normalizeDateResult("date_range", start.startDate, end.endDate, Math.min(start.confidence, end.confidence));
  }

  return null;
}

export function extractDateFilterResult(message) {
  const text = String(message || "").trim();
  if (!text) return null;

  const range = parseDateRangeExpression(text);
  if (range) return range;

  const exactToken = findExactDateToken(text);
  if (exactToken) {
    const exact = parseExactDateToken(exactToken);
    if (exact) return exact;
  }

  return parseMonthExpression(text) || parseQuarterExpression(text) || parseYearExpression(text) || parseRelativeExpression(text);
}

export function normalizeDateQuery(message) {
  return extractDateFilterResult(message);
}

export function buildDateFilter(fieldName, startDate, endDate) {
  if (!fieldName || !startDate || !endDate) return "";
  return `${fieldName} ge datetime'${startDate}' and ${fieldName} lt datetime'${endDate}'`;
}

export function extractDateFilters(message, field = "PoDocDate") {
  const result = extractDateFilterResult(message);
  if (!result) return [];

  return [
    { field, op: "ge", value: result.startDate, type: "datetime" },
    { field, op: "lt", value: result.endDate, type: "datetime" },
  ];
}

export function extractCreatedDateFilters(message, field = "PoDocDate") {
  return extractDateFilters(message, field);
}

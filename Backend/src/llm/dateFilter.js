export function parseMonthYearFromText(message, now = new Date()) {
  const m = String(message || "").toLowerCase();

  const monthMap = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };

  let month = null;
  for (const [k, v] of Object.entries(monthMap)) {
    if (new RegExp(`\\b${k}\\b`, "i").test(m)) {
      month = v;
      break;
    }
  }

  const yearMatch = m.match(/\b(20\d{2})\b/);
  const year = yearMatch ? Number(yearMatch[1]) : null;

  // ❌ if nothing found
  if (!month && !year) return null;

  return { month, year };
}

// ------------------------------

export function monthStartEndUTC(year, month) {
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 0, 23, 59, 59));
  return { start, end };
}

// ------------------------------

export function toYyyyMmDd(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().slice(0, 10);
}

// ------------------------------

/**
 * MAIN FILTER BUILDER (🔥 IMPORTANT)
 */
export function buildDateFilters(message) {
  const filters = {};

  const my = parseMonthYearFromText(message);

  if (my) {
    const { month, year } = my;

    // ✅ Case 1: Month + Year (Oct 2017)
    if (month && year) {
      const { start, end } = monthStartEndUTC(year, month);
      filters.docDateFrom = toYyyyMmDd(start);
      filters.docDateTo = toYyyyMmDd(end);
    }

    // ✅ Case 2: Only Month (October → all years)
    else if (month && !year) {
      filters.monthOnly = month;
    }

    // ✅ Case 3: Only Year (2017)
    else if (!month && year) {
      const start = new Date(Date.UTC(year, 0, 1));
      const end = new Date(Date.UTC(year, 11, 31, 23, 59, 59));

      filters.docDateFrom = toYyyyMmDd(start);
      filters.docDateTo = toYyyyMmDd(end);
    }
  }

  return Object.keys(filters).length ? filters : null;
}

// ------------------------------

/**
 * APPLY FILTERS (🔥 IMPORTANT)
 */
export function applyHeaderFilters(headers, filters) {
  if (!filters) return headers;

  let out = headers;

  // ✅ Month-only filter (any year)
  if (filters.monthOnly) {
    const m = filters.monthOnly;

    out = out.filter((h) => {
      const d = h.doc_date || h.created_on;
      if (!d) return false;

      const month = new Date(d).getUTCMonth() + 1;
      return month === m;
    });
  }

  // ✅ Date range filter
  if (filters.docDateFrom && filters.docDateTo) {
    const from = filters.docDateFrom;
    const to = filters.docDateTo;

    out = out.filter((h) => {
      const d = h.doc_date || h.created_on;
      if (!d) return false;

      return d >= from && d <= to;
    });
  }

  return out;
}

// ------------------------------

/**
 * Parse "between 2026-01-01 and 2026-01-15"
 */
export function parseIsoDateRangeFromText(message) {
  const m = String(message || "");
  const dates = m.match(/\b\d{4}-\d{2}-\d{2}\b/g);

  if (!dates || dates.length < 2) return null;

  const start = new Date(dates[0] + "T00:00:00Z");
  const end = new Date(dates[1] + "T23:59:59Z");

  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;

  return { start, end };
}
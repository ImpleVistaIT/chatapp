import test from "node:test";
import assert from "node:assert/strict";

import { extractDocQuery } from "../src/services/extractor/extractor.service.js";
import { buildDateFilter, extractDateFilters, getWeekDateRange, normalizeDateQuery } from "../src/services/filters/dateFilters.js";

function filterString(filters) {
  return filters.map((filter) => `${filter.field} ${filter.op} ${filter.value}`).join(" | ");
}

test("exact ISO date is never treated as a year", () => {
  const result = normalizeDateQuery("how many POs are there 2017-10-10");

  assert.equal(result?.type, "exact_date");
  assert.equal(result?.startDate, "2017-10-10T00:00:00");
  assert.equal(result?.endDate, "2017-10-11T00:00:00");
});

test("supports multiple exact date formats", () => {
  const cases = [
    ["how many POs on 10-Oct-2017", "2017-10-10T00:00:00", "2017-10-11T00:00:00"],
    ["how many POs on Oct 10 2017", "2017-10-10T00:00:00", "2017-10-11T00:00:00"],
    ["how many POs on 10/10/2017", "2017-10-10T00:00:00", "2017-10-11T00:00:00"],
    ["how many POs on 20171010", "2017-10-10T00:00:00", "2017-10-11T00:00:00"],
    ["POs created on October 10th 2017", "2017-10-10T00:00:00", "2017-10-11T00:00:00"],
  ];

  for (const [query, startDate, endDate] of cases) {
    const result = normalizeDateQuery(query);
    assert.equal(result?.type, "exact_date", query);
    assert.equal(result?.startDate, startDate, query);
    assert.equal(result?.endDate, endDate, query);
  }
});

test("supports date ranges", () => {
  const result = normalizeDateQuery("how many POs between 2017-10-10 and 2017-10-31");

  assert.equal(result?.type, "date_range");
  assert.equal(result?.startDate, "2017-10-10T00:00:00");
  assert.equal(result?.endDate, "2017-11-01T00:00:00");
});

test("supports month queries", () => {
  const result = normalizeDateQuery("how many POs in October 2017");

  assert.equal(result?.type, "month");
  assert.equal(result?.startDate, "2017-10-01T00:00:00");
  assert.equal(result?.endDate, "2017-11-01T00:00:00");
});

test("supports quarter queries", () => {
  const q1 = normalizeDateQuery("how many POs in Q1 2017");
  const q4 = normalizeDateQuery("how many POs in Q4 2020");

  assert.equal(q1?.type, "quarter");
  assert.equal(q1?.startDate, "2017-01-01T00:00:00");
  assert.equal(q1?.endDate, "2017-04-01T00:00:00");

  assert.equal(q4?.type, "quarter");
  assert.equal(q4?.startDate, "2020-10-01T00:00:00");
  assert.equal(q4?.endDate, "2021-01-01T00:00:00");
});

test("supports year queries", () => {
  const result = normalizeDateQuery("how many POs in 2017");

  assert.equal(result?.type, "year");
  assert.equal(result?.startDate, "2017-01-01T00:00:00");
  assert.equal(result?.endDate, "2018-01-01T00:00:00");
});

test("supports relative date queries", () => {
  process.env.FIXED_TODAY = "2026-06-19";

  const today = normalizeDateQuery("today");
  const yesterday = normalizeDateQuery("yesterday");
  const last7 = normalizeDateQuery("last 7 days");
  const last30 = normalizeDateQuery("last 30 days");
  const thisMonth = normalizeDateQuery("this month");
  const lastMonth = normalizeDateQuery("last month");
  const thisYear = normalizeDateQuery("this year");
  const lastYear = normalizeDateQuery("last year");

  assert.equal(today?.startDate, "2026-06-19T00:00:00");
  assert.equal(today?.endDate, "2026-06-20T00:00:00");
  assert.equal(yesterday?.startDate, "2026-06-18T00:00:00");
  assert.equal(yesterday?.endDate, "2026-06-19T00:00:00");
  assert.equal(last7?.startDate, "2026-06-13T00:00:00");
  assert.equal(last7?.endDate, "2026-06-20T00:00:00");
  assert.equal(last30?.startDate, "2026-05-21T00:00:00");
  assert.equal(last30?.endDate, "2026-06-20T00:00:00");
  assert.equal(thisMonth?.startDate, "2026-06-01T00:00:00");
  assert.equal(thisMonth?.endDate, "2026-07-01T00:00:00");
  assert.equal(lastMonth?.startDate, "2026-05-01T00:00:00");
  assert.equal(lastMonth?.endDate, "2026-06-01T00:00:00");
  assert.equal(thisYear?.startDate, "2026-01-01T00:00:00");
  assert.equal(thisYear?.endDate, "2027-01-01T00:00:00");
  assert.equal(lastYear?.startDate, "2025-01-01T00:00:00");
  assert.equal(lastYear?.endDate, "2026-01-01T00:00:00");

  delete process.env.FIXED_TODAY;
});

test("supports Sunday through Saturday week ranges", () => {
  const ymd = (date) =>
    `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;

  const cases = [
    {
      label: "Monday reference",
      referenceDate: new Date(Date.UTC(2026, 6, 6)),
      offset: 0,
      start: "2026-07-05",
      end: "2026-07-11",
    },
    {
      label: "Sunday reference",
      referenceDate: new Date(Date.UTC(2026, 6, 5)),
      offset: 0,
      start: "2026-07-05",
      end: "2026-07-11",
    },
    {
      label: "Saturday reference",
      referenceDate: new Date(Date.UTC(2026, 6, 11)),
      offset: 0,
      start: "2026-07-05",
      end: "2026-07-11",
    },
    {
      label: "Month boundary",
      referenceDate: new Date(Date.UTC(2026, 7, 1)),
      offset: 0,
      start: "2026-07-26",
      end: "2026-08-01",
    },
    {
      label: "Year boundary",
      referenceDate: new Date(Date.UTC(2026, 0, 1)),
      offset: 0,
      start: "2025-12-28",
      end: "2026-01-03",
    },
    {
      label: "Leap year",
      referenceDate: new Date(Date.UTC(2024, 1, 29)),
      offset: 0,
      start: "2024-02-25",
      end: "2024-03-02",
    },
    {
      label: "Last week",
      referenceDate: new Date(Date.UTC(2026, 6, 6)),
      offset: -1,
      start: "2026-06-28",
      end: "2026-07-04",
    },
    {
      label: "Next week",
      referenceDate: new Date(Date.UTC(2026, 6, 6)),
      offset: 1,
      start: "2026-07-12",
      end: "2026-07-18",
    },
  ];

  for (const testCase of cases) {
    const range = getWeekDateRange(testCase.referenceDate, testCase.offset);
    assert.equal(ymd(range.startOfWeek), testCase.start, testCase.label);
    assert.equal(ymd(range.endOfWeek), testCase.end, testCase.label);
  }
});

test("recognizes week phrases as explicit Sunday-Saturday ranges", () => {
  process.env.FIXED_TODAY = "2026-07-06";

  const thisWeek = normalizeDateQuery("this week");
  const lastWeek = normalizeDateQuery("last week");
  const nextWeek = normalizeDateQuery("next week");

  assert.equal(thisWeek?.type, "relative");
  assert.equal(thisWeek?.startDate, "2026-07-05T00:00:00");
  assert.equal(thisWeek?.endDate, "2026-07-12T00:00:00");

  assert.equal(lastWeek?.type, "relative");
  assert.equal(lastWeek?.startDate, "2026-06-28T00:00:00");
  assert.equal(lastWeek?.endDate, "2026-07-05T00:00:00");

  assert.equal(nextWeek?.type, "relative");
  assert.equal(nextWeek?.startDate, "2026-07-12T00:00:00");
  assert.equal(nextWeek?.endDate, "2026-07-19T00:00:00");

  delete process.env.FIXED_TODAY;
});

test("buildDateFilter generates a deterministic OData fragment", () => {
  assert.equal(
    buildDateFilter("CrtDate", "2017-10-10T00:00:00", "2017-10-11T00:00:00"),
    "CrtDate ge datetime'2017-10-10T00:00:00' and CrtDate lt datetime'2017-10-11T00:00:00'"
  );
});

test("extractDocQuery applies created-by plus date filters", async () => {
  const extracted = await extractDocQuery({
    query: "how many POs created by S4H_MM_DEM on 2017-10-10",
    allowedFields: ["CrtDate", "UserCreated", "PoNo"],
    fieldLabels: {},
  });

  const userFilter = (extracted.filters || []).find((filter) => filter.field === "UserCreated");
  const dateFilters = (extracted.filters || []).filter((filter) => filter.field === "CrtDate");

  assert.equal(userFilter?.op, "eq");
  assert.equal(userFilter?.value, "S4H_MM_DEM");
  assert.equal(filterString(dateFilters), "CrtDate ge 2017-10-10T00:00:00 | CrtDate lt 2017-10-11T00:00:00");
});

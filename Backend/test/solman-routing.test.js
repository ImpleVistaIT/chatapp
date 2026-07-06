import test from "node:test";
import assert from "node:assert/strict";

import {
  inferCrListIntent,
  pickCrListEntities,
  getSolmanCrStatusMaxRows,
  inferCreatedByFilterFromQuery,
  inferDateRangeFromQuery,
  inferCrStatusFilterFromQuery,
  inferRequestedTop,
} from "../src/controllers/stream/solman/solman.shared.js";
import {
  isSolmanCrQuery,
  isValidSolmanPendingAction,
  resolveRestoredSolmanQuery,
} from "../src/controllers/chat.stream.controller.js";
import {
  extractCreateChangeRequestEntitiesFromText,
  getCreateChangeRequestQualifiers,
  isCreateChangeRequestQuery,
} from "../src/services/routing/promptClassifier.service.js";
import { detectTransportQueryIntent } from "../src/services/routing/detectors/genericRuleDetector.js";
import { normalizeSolmanStatusChart } from "../../frontend/src/utils/solmanChart.js";

test("show CR status stays on the SolMan list flow without inventing a process type", () => {
  const entities = pickCrListEntities({}, "show CR status");

  assert.equal(entities.processType, "");
  assert.equal(entities.triggerAll, "X");
  assert.equal(inferCrListIntent({ intent: "unknown" }, "show CR status"), true);
});

test("restored SolMan query keeps the original year prompt when landscape is the follow-up", () => {
  const restored = resolveRestoredSolmanQuery({
    queryIsNextPage: false,
    queryIsLandscapeOnly: true,
    effectivePendingActionQuery: "show closed CR in 2026",
    rawQuery: "ROW",
    effectiveQuery: "ROW",
  });

  assert.equal(restored, "show closed CR in 2026");
});

test("open CR queries map to pending-style exclusion filters", () => {
  const statusFilter = inferCrStatusFilterFromQuery("show open CRs created this month");

  assert.equal(statusFilter.status, "");
  assert.equal(statusFilter.statusMode, "pending");
  assert.deepEqual(statusFilter.excludeStatuses, ["CLOSED", "WITHDRAWN"]);

  const entities = pickCrListEntities({}, "show open CRs created this month");
  assert.equal(entities.status, "");
  assert.equal(entities.statusMode, "pending");
  assert.deepEqual(entities.excludeStatuses, ["CLOSED", "WITHDRAWN"]);
  assert.equal(entities.dateText, "show open cr created this month");
});

test("rejected CR queries normalize to Withdrawn status", () => {
  const filter = inferCrStatusFilterFromQuery("show rejected CR's created last month");
  assert.equal(filter.status, "WITHDRAWN");

  const entities = pickCrListEntities({ status: "rejected" }, "show rejected CR's created last month");
  assert.equal(entities.status, "WITHDRAWN");
});

test("SolMan explicit count queries infer the requested number", () => {
  assert.equal(inferRequestedTop("Show the last 10 CRs"), 10);
  assert.equal(inferRequestedTop("Show the latest 25 change requests"), 25);
  assert.equal(inferRequestedTop("List the 10 most recent CRs"), 10);
  assert.equal(inferRequestedTop("Show the top 20 most recent CRs"), 20);

  const latestCreatedByMe = pickCrListEntities({}, "Show the latest 25 CRs created by me");
  assert.equal(latestCreatedByMe.top, 25);
  assert.equal(latestCreatedByMe.explicitCountRequested, true);
  assert.equal(latestCreatedByMe.createdByMode, "self");

  const mostRecent = pickCrListEntities({}, "List the 10 most recent CRs");
  assert.equal(mostRecent.top, 10);
  assert.equal(mostRecent.explicitCountRequested, true);
});

test("create CR intent recognizes natural language variations", () => {
  const phrases = [
    "Create a new CR",
    "Raise a change request",
    "Submit CR",
    "Open a new CR",
    "Start a transport change",
    "I need an emergency change request",
    "Please submit a CR for approval",
    "Help me create a transport CR",
  ];

  for (const phrase of phrases) {
    assert.equal(isCreateChangeRequestQuery(phrase), true, phrase);
  }
});

test("retrieval-style CR queries do not trigger create intent", () => {
  const phrases = [
    "Show CRs created between 2026-07-01 and 2026-07-05 by me",
    "Show the latest 25 CRs from this month",
    "Show open CRs created this week",
    "Show open CRs created this month",
    "Show closed CRs created this month",
    "Show pending CRs created by me",
    "Show rejected CRs created yesterday",
    "Show the last 50 open CRs",
    "List CRs created today",
    "Find rejected CRs",
    "Get latest 25 CRs",
    "Display closed CRs",
  ];

  for (const phrase of phrases) {
    assert.equal(isCreateChangeRequestQuery(phrase), false, phrase);
  }
});

test("create CR qualifiers are extracted from plain language", () => {
  const emergency = getCreateChangeRequestQualifiers("Create an emergency change request");
  assert.equal(emergency.ChangeType, "Emergency");

  const normal = getCreateChangeRequestQualifiers("Create a normal CR");
  assert.equal(normal.ChangeType, "Normal");

  const transport = getCreateChangeRequestQualifiers("Create a transport change request");
  assert.equal(transport.Category, "Transport");

  const deployment = getCreateChangeRequestQualifiers("Create a change request for system deployment");
  assert.equal(deployment.Purpose, "System Deployment");

  const approval = getCreateChangeRequestQualifiers("Submit a CR for approval");
  assert.equal(approval.Workflow, "Approval");
});

test("SolMan date parser supports between ranges and month-name inputs", () => {
  const range = inferDateRangeFromQuery("show closed CRs between 01-Jan-2026 and 31-Jan-2026");

  assert.equal(range?.fromDate, "20260101");
  assert.equal(range?.toDate, "20260131");
  assert.equal(range?.granularity, "range");

  const exactDates = [
    "Show CR created on 14.06.2022",
    "Show CR created on 14/06/2022",
    "Show CR created on 2022-06-14",
    "Show CR created on 14-06-2022",
    "Show CR created on June 14 2022",
    "Show CR created on 14 June 2022",
    "Retrieve CRs for 14th June 2022",
  ];

  for (const query of exactDates) {
    const exact = inferDateRangeFromQuery(query);
    assert.equal(exact?.fromDate, "20220614", query);
    assert.equal(exact?.toDate, "20220614", query);
    assert.equal(exact?.granularity, "day", query);
  }

  const lastYear = inferDateRangeFromQuery("show rejected CRs last year");
  const currentYear = new Date().getFullYear();
  assert.equal(lastYear?.fromDate, `${currentYear - 1}0101`);
  assert.equal(lastYear?.toDate, `${currentYear - 1}1231`);
  assert.equal(lastYear?.granularity, "year");
});

test("SolMan date parser supports specific date range keywords", () => {
  const today = new Date();
  const todayYmd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const after = inferDateRangeFromQuery("Show CRs after 15.03.2024");
  assert.equal(after?.fromDate, "20240316");
  assert.equal(after?.toDate, todayYmd);
  assert.equal(after?.granularity, "range");

  const before = inferDateRangeFromQuery("Show CRs before 01.01.2025");
  assert.equal(before?.fromDate, "19000101");
  assert.equal(before?.toDate, "20241231");
  assert.equal(before?.granularity, "range");

  const since = inferDateRangeFromQuery("Show CRs since 01.01.2024");
  assert.equal(since?.fromDate, "20240101");
  assert.equal(since?.toDate, todayYmd);
  assert.equal(since?.granularity, "range");

  const reversed = inferDateRangeFromQuery("Show CRs created by me from 2026/06/29 to 2026/05/20");
  assert.equal(reversed?.fromDate, "20260520");
  assert.equal(reversed?.toDate, "20260629");
  assert.equal(reversed?.granularity, "range");
});

test("SolMan date parser supports year-only ranges", () => {
  const range = inferDateRangeFromQuery("show closed CR from 2020 to 2022");

  assert.equal(range?.fromDate, "20200101");
  assert.equal(range?.toDate, "20221231");
  assert.equal(range?.granularity, "range");
});

test("SolMan date parser supports today yesterday and last N days", () => {
  const today = new Date();
  const ymd = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;

  const todayRange = inferDateRangeFromQuery("show rejected CRs today");
  assert.equal(todayRange?.fromDate, ymd);
  assert.equal(todayRange?.toDate, ymd);

  const yesterdayRange = inferDateRangeFromQuery("show rejected CRs yesterday");
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayYmd = `${yesterday.getFullYear()}${String(yesterday.getMonth() + 1).padStart(2, "0")}${String(yesterday.getDate()).padStart(2, "0")}`;
  assert.equal(yesterdayRange?.fromDate, yesterdayYmd);
  assert.equal(yesterdayRange?.toDate, yesterdayYmd);

  const last30 = inferDateRangeFromQuery("show pending CRs last 30 days");
  const start30 = new Date(today);
  start30.setDate(start30.getDate() - 30);
  const start30Ymd = `${start30.getFullYear()}${String(start30.getMonth() + 1).padStart(2, "0")}${String(start30.getDate()).padStart(2, "0")}`;
  assert.equal(last30?.fromDate, start30Ymd);
  assert.equal(last30?.toDate, ymd);
});

test("SolMan date parser matches the requested relative-period phrases", () => {
  const today = new Date();
  const ymd = (date) =>
    `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
  const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const addDays = (date, days) => {
    const value = new Date(date);
    value.setDate(value.getDate() + days);
    return value;
  };
  const startOfWeek = (date) => {
    const value = startOfDay(date);
    const day = value.getDay();
    const diff = -day;
    return addDays(value, diff);
  };
  const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);
  const addMonths = (date, months) => {
    const value = new Date(date);
    const dayOfMonth = value.getDate();
    value.setDate(1);
    value.setMonth(value.getMonth() + months);
    value.setDate(Math.min(dayOfMonth, new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()));
    return value;
  };
  const addYears = (date, years) => {
    const value = new Date(date);
    const dayOfMonth = value.getDate();
    value.setDate(1);
    value.setFullYear(value.getFullYear() + years);
    value.setDate(Math.min(dayOfMonth, new Date(value.getFullYear(), value.getMonth() + 1, 0).getDate()));
    return value;
  };

  const cases = [
    {
      period: "today",
      query: "Show today's CRs",
      startDate: ymd(startOfDay(today)),
      endDate: ymd(startOfDay(today)),
    },
    {
      period: "today",
      query: "Show today's CR's",
      startDate: ymd(startOfDay(today)),
      endDate: ymd(startOfDay(today)),
    },
    {
      period: "yesterday",
      query: "Display yesterday's change requests",
      startDate: ymd(addDays(startOfDay(today), -1)),
      endDate: ymd(addDays(startOfDay(today), -1)),
    },
    {
      period: "this_week",
      query: "Retrieve CRs from this week",
      startDate: ymd(startOfWeek(today)),
      endDate: ymd(addDays(startOfWeek(today), 6)),
    },
    {
      period: "last_week",
      query: "Show last week's CRs",
      startDate: ymd(addDays(startOfWeek(today), -7)),
      endDate: ymd(addDays(startOfWeek(today), -1)),
    },
    {
      period: "next_week",
      query: "Show next week's CRs",
      startDate: ymd(addDays(startOfWeek(today), 7)),
      endDate: ymd(addDays(startOfWeek(today), 13)),
    },
    {
      period: "this_month",
      query: "List all CRs created this month",
      startDate: ymd(startOfMonth(today)),
      endDate: ymd(startOfDay(today)),
    },
    {
      period: "last_month",
      query: "Show last month's CRs",
      startDate: ymd(startOfMonth(addMonths(today, -1))),
      endDate: ymd(new Date(addMonths(today, -1).getFullYear(), addMonths(today, -1).getMonth() + 1, 0)),
    },
    {
      period: "this_year",
      query: "Show this year's CRs",
      startDate: `${today.getFullYear()}0101`,
      endDate: ymd(startOfDay(today)),
    },
    {
      period: "last_year",
      query: "Show last year's CRs",
      startDate: `${today.getFullYear() - 1}0101`,
      endDate: `${today.getFullYear() - 1}1231`,
    },
    {
      period: "last_3_months",
      query: "Show CRs created in the last 3 months",
      startDate: ymd(addMonths(today, -3)),
      endDate: ymd(startOfDay(today)),
    },
    {
      period: "last_2_weeks",
      query: "Show CRs from the last 2 weeks",
      startDate: ymd(addDays(startOfDay(today), -14)),
      endDate: ymd(startOfDay(today)),
    },
    {
      period: "last_5_years",
      query: "Show CRs from the last 5 years",
      startDate: ymd(addYears(startOfDay(today), -5)),
      endDate: ymd(startOfDay(today)),
    },
  ];

  for (const testCase of cases) {
    const result = inferDateRangeFromQuery(testCase.query);
    assert.equal(result?.period, testCase.period, testCase.query);
    assert.equal(result?.startDate, testCase.startDate, testCase.query);
    assert.equal(result?.endDate, testCase.endDate, testCase.query);
  }
});

test("valid SolMan pending action requires system, intent, and filters", () => {
  assert.equal(
    isValidSolmanPendingAction({
      system: "solman",
      intent: "list_change_requests",
      filters: { processType: "YMHF" },
    }),
    true
  );

  assert.equal(
    isValidSolmanPendingAction({
      system: "solman",
      intent: "list_change_requests",
      filters: null,
    }),
    false
  );
});

test("invalid chart payloads are ignored safely", () => {
  assert.equal(normalizeSolmanStatusChart(null), null);
  assert.equal(
    normalizeSolmanStatusChart({
      type: "status_distribution",
      data: [{ status: "", count: "bad" }],
    }),
    null
  );
});

test("valid status distribution chart normalizes for rendering", () => {
  const chart = normalizeSolmanStatusChart({
    type: "status_distribution",
    chartType: "donut",
    title: "CR Status Distribution",
    totalCRs: 4,
    data: [
      { status: "Open", count: 2, percentage: 50 },
      { status: "Closed", count: 2, percentage: 50 },
    ],
  });

  assert.equal(chart.title, "CR Status Distribution");
  assert.equal(chart.data.length, 2);
  assert.equal(chart.totalCRs, 4);
});

test("SolMan CR status row cap is configurable", () => {
  const originalValue = process.env.SOLMAN_CR_STATUS_MAX_ROWS;

  try {
    delete process.env.SOLMAN_CR_STATUS_MAX_ROWS;
    assert.equal(getSolmanCrStatusMaxRows(), 30);

    process.env.SOLMAN_CR_STATUS_MAX_ROWS = "12";
    assert.equal(getSolmanCrStatusMaxRows(), 12);
  } finally {
    if (originalValue === undefined) {
      delete process.env.SOLMAN_CR_STATUS_MAX_ROWS;
    } else {
      process.env.SOLMAN_CR_STATUS_MAX_ROWS = originalValue;
    }
  }
});

test("PO created-by prompt must not trigger SolMan CR routing", () => {
  assert.equal(isSolmanCrQuery("show po created by S4H_MM"), false);
});

test("PO next-page prompt must not trigger SolMan CR routing", () => {
  assert.equal(isSolmanCrQuery("show next 10 po"), false);
});

test("CR created-by prompt should still trigger SolMan CR routing", () => {
  assert.equal(isSolmanCrQuery("show change requests created by IRAM"), true);
});

test("SolMan created-by inference accepts quoted filler-word phrasing", () => {
  const result = inferCreatedByFilterFromQuery('show change requests created by the user "ISLM"');

  assert.equal(result.createdBy, "ISLM");
  assert.equal(result.createdByMode, "explicit");
});

test("count-based CR queries still trigger SolMan routing", () => {
  assert.equal(isSolmanCrQuery("Show the last 10 CRs."), true);
  assert.equal(isSolmanCrQuery("Show the latest 25 change requests."), true);
  assert.equal(isSolmanCrQuery("List the 10 most recent CRs."), true);
});

test("create CR prompt text extracts label-based field values", () => {
  const extracted = extractCreateChangeRequestEntitiesFromText(
    "DEscription - CR creation test from chatbot, developer & tester, DEL responsible - IMVT0001, Landscape - Z_DXB_ECC Work item ref - 1256906"
  );

  assert.equal(extracted.ShortDesc, "CR creation test from chatbot");
  assert.equal(extracted.DeliveryResponsible, "IMVT0001");
  assert.equal(extracted.Landscape, "Z_DXB_ECC");
  assert.equal(extracted.WorkItemReference, "1256906");
});

test("transport query variants normalize to the same canonical intent", () => {
  const cases = [
    "show transports of cr 8000003218",
    "show transports cr 8000003218",
    "get transports of cr 8000003218",
    "fetch transports for cr 8000003218",
    "please show transports of cr 8000003218",
    "transport details of cr 8000003218",
    "shwo transports of cr 8000003218",
    "tranports of cr 8000003218",
  ];

  for (const query of cases) {
    const result = detectTransportQueryIntent(query);

    assert.equal(result.matched, true, query);
    assert.equal(result.intent, "SHOW_TRANSPORTS", query);
    assert.equal(result.routeIntent, "transport_list", query);
    assert.equal(result.canonicalQuery, "show transports cr 8000003218", query);
    assert.equal(result.entities.cr_number, "8000003218", query);
    assert.equal(result.shouldUseLlm, false, query);
  }
});

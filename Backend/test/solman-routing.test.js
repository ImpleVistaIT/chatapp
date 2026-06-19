import test from "node:test";
import assert from "node:assert/strict";

import {
  inferCrListIntent,
  pickCrListEntities,
} from "../src/controllers/stream/solman/solman.shared.js";
import {
  isSolmanCrQuery,
  isValidSolmanPendingAction,
} from "../src/controllers/chat.stream.controller.js";
import {
  extractCreateChangeRequestEntitiesFromText,
} from "../src/services/routing/promptClassifier.service.js";
import { detectTransportQueryIntent } from "../src/services/routing/detectors/genericRuleDetector.js";
import { normalizeSolmanStatusChart } from "../../frontend/src/utils/solmanChart.js";

test("show CR status stays on the SolMan list flow without inventing a process type", () => {
  const entities = pickCrListEntities({}, "show CR status");

  assert.equal(entities.processType, "");
  assert.equal(entities.triggerAll, "X");
  assert.equal(inferCrListIntent({ intent: "unknown" }, "show CR status"), true);
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

test("PO created-by prompt must not trigger SolMan CR routing", () => {
  assert.equal(isSolmanCrQuery("show po created by S4H_MM"), false);
});

test("PO next-page prompt must not trigger SolMan CR routing", () => {
  assert.equal(isSolmanCrQuery("show next 10 po"), false);
});

test("CR created-by prompt should still trigger SolMan CR routing", () => {
  assert.equal(isSolmanCrQuery("show change requests created by IRAM"), true);
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

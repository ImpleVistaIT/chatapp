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

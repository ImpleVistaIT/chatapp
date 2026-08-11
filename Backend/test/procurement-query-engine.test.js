import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCountODataQuery,
  normalizeCountCanonicalQuery,
} from "../src/services/procurement/procurementQueryEngine.service.js";

test("count queries collapse a single-day date range into an exact PoDocDate eq filter", () => {
  const canonicalQuery = {
    target: {
      entitySet: "Po_detailsSet",
      serviceName: "ZMM_PO_DETAILS_SRV",
      entityTypeName: "Po_details",
      displayName: "purchase orders",
    },
    metric: "count",
    measureField: null,
    filters: [
      { field: "PoDocDate", operator: "ge", type: "datetime", value: "2017-10-10T00:00:00" },
      { field: "PoDocDate", operator: "lt", type: "datetime", value: "2017-10-11T00:00:00" },
    ],
    groupBy: [],
    sortBy: [],
    pagination: { limit: 100, offset: 0 },
  };

  const normalized = normalizeCountCanonicalQuery(canonicalQuery);
  const relativePath = buildCountODataQuery({
    catalog: { entitySet: "Po_detailsSet" },
    canonicalQuery: normalized,
  });

  assert.equal(
    relativePath,
    "Po_detailsSet/$count?$filter=PoDocDate%20eq%20datetime%272017-10-10T00%3A00%3A00%27"
  );
});
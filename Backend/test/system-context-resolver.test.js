import test from "node:test";
import assert from "node:assert/strict";
import { resolveTargetSystem } from "../src/services/routing/systemContextResolver.service.js";

test("SolMan prompts prefer the connected SolMan system over requested UI systemId", async () => {
  const result = await resolveTargetSystem({
    query: "show cr status",
    classified: {
      system: "solman",
      intent: "list_change_requests",
    },
    requestedSystemId: "S4D",
    availableSystems: [
      {
        systemId: "S4D",
        name: "S4HANA",
        host: "192.168.1.5",
        port: "44300",
        connected: true,
      },
      {
        systemId: "HSD",
        name: "Solution Manager",
        host: "10.10.10.20",
        port: "44300",
        connected: true,
      },
    ],
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.targetSystemId, "HSD");
  assert.deepEqual(result.targetEndpoint, { host: "10.10.10.20", port: "44300" });
  assert.equal(result.reason, "solman_preferred_connected");
});

test("Disconnected preferred SolMan system returns disconnected status", async () => {
  const result = await resolveTargetSystem({
    query: "show cr status",
    classified: {
      system: "solman",
      intent: "list_change_requests",
    },
    availableSystems: [
      {
        systemId: "HSD",
        name: "Solution Manager",
        host: "10.10.10.20",
        port: "44300",
        connected: false,
      },
    ],
  });

  assert.equal(result.status, "disconnected");
  assert.equal(result.targetSystemId, "HSD");
  assert.deepEqual(result.targetEndpoint, { host: "10.10.10.20", port: "44300" });
});

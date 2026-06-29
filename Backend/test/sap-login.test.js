import test from "node:test";
import assert from "node:assert/strict";

import { loginToSolman } from "../src/services/systems/solman/login.service.js";
import { inferSystemKind } from "../src/routes/sap.routes.js";

function makeXmlResponse(message = "Login successful", userName = "IMVT0001") {
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns:d="http://schemas.microsoft.com/ado/2007/08/dataservices" xmlns:m="http://schemas.microsoft.com/ado/2007/08/dataservices/metadata">
  <entry>
    <content type="application/xml">
      <m:properties>
        <d:Message>${message}</d:Message>
        <d:UserName>${userName}</d:UserName>
      </m:properties>
    </content>
  </entry>
</feed>`;
}

test("HSD maps to ZNEW_USER_LOGIN_SRV", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      text: async () => makeXmlResponse(),
    };
  };

  try {
    const result = await loginToSolman({
      systemId: "HSD",
      sapUser: "IMVT0001",
      sapPassword: "Jan@1234",
      requireMappedSystem: true,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, result.requestUrl);
    assert.match(result.requestUrl, /https:\/\/vedr\.go\.akamai-access\.com\/sap\/opu\/odata\/sap\/ZNEW_USER_LOGIN_SRV\/user_loginSet\?/);
    assert.match(result.requestUrl, /\$format=json$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("HSD is treated as SolMan during login validation", () => {
  assert.equal(inferSystemKind({ systemId: "HSD", name: "HSD" }), "solman");
});

test("S4D maps to ZSAP_USER_LOGIN_SRV", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];

  globalThis.fetch = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      text: async () => makeXmlResponse("Login successful", "ABC"),
    };
  };

  try {
    const result = await loginToSolman({
      systemId: "S4D",
      sapUser: "ABC",
      sapPassword: "123",
      requireMappedSystem: true,
    });

    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, result.requestUrl);
    assert.match(result.requestUrl, /https:\/\/vhcals4dci\.dummy\.nodomain:44300\/sap\/opu\/odata\/sap\/ZSAP_USER_LOGIN_SRV\/user_dataSet\?/);
    assert.match(result.requestUrl, /\$format=json$/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("invalid systemId is rejected", async () => {
  await assert.rejects(
    () =>
      loginToSolman({
        systemId: "BAD",
        sapUser: "IMVT0001",
        sapPassword: "Jan@1234",
        requireMappedSystem: true,
      }),
    (error) => error?.code === "UNSUPPORTED_SYSTEM_ID" && error?.status === 400
  );
});

test("missing configuration is rejected", async () => {
  await assert.rejects(
    () =>
      loginToSolman({
        systemId: "HSD",
        sapUser: "IMVT0001",
        sapPassword: "Jan@1234",
        loginTargets: {
          HSD: {
            baseUrl: "",
            serviceName: "",
            entitySet: "",
          },
        },
        requireMappedSystem: true,
      }),
    (error) => error?.code === "SAP_LOGIN_CONFIG_INCOMPLETE" && error?.status === 500
  );
});
import { postToSap } from "../../sap/sapWrite.service.js";

function cleanString(v) {
  return String(v || "").trim();
}

function normalizeUrlNav(items) {
  if (!Array.isArray(items)) return [];

  return items
    .map((x) => ({
      URL: cleanString(x?.URL),
      URL_NAME: cleanString(x?.URL_NAME),
    }))
    .filter((x) => x.URL && x.URL_NAME);
}

function validatePayload(payload) {
  const required = [
    "ShortDesc",
    "DeliveryResponsible",
    "Developer",
    "Tester",
    "WorkItemReference",
    "Landscape",
  ];

  const missing = required.filter((k) => !cleanString(payload?.[k]));
  if (missing.length > 0) {
    const err = new Error(`Missing required fields: ${missing.join(", ")}`);
    err.status = 400;
    throw err;
  }
}

function buildCreatePayload(payload) {
  const out = {
    ShortDesc: cleanString(payload.ShortDesc),
    DeliveryResponsible: cleanString(payload.DeliveryResponsible),
    Developer: cleanString(payload.Developer),
    Tester: cleanString(payload.Tester),
    WorkItemReference: cleanString(payload.WorkItemReference),
    Landscape: cleanString(payload.Landscape),
  };

  const reqUrlNav = normalizeUrlNav(payload.REQ_URL_NAV);
  if (reqUrlNav.length > 0) {
    out.REQ_URL_NAV = reqUrlNav;
  }

  return out;
}

function normalizeCreateResponse(raw) {
  const d = raw?.d || {};

  const msgType = cleanString(d.EMsgType);
  const message = cleanString(d.EMsgDesc);
  const changeRequestId = cleanString(d.ESolmanCr);
  const status = cleanString(d.EStatus);

  return {
    ok: msgType !== "E" && Boolean(changeRequestId || msgType === "S"),
    msgType,
    message,
    changeRequestId,
    status,
    raw,
  };
}

export async function createSolmanChangeRequest({ system, sapAuth, payload }) {
  validatePayload(payload);

  const body = buildCreatePayload(payload);

  const raw = await postToSap(
    {
      system,
      relativePath: "/sap/opu/odata/sap/ZCR_CREATION_CHARM_SRV/ZChange_requestSet",
      body,
    },
    sapAuth
  );

  return normalizeCreateResponse(raw);
}
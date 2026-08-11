import { cleanString } from "./solman.shared.js";

export function getMissingCreateTransportRequestFields(payload = {}) {
  const missing = [];

  if (!cleanString(payload.SolmanChangeReq)) missing.push("SolmanChangeReq");
  if (!cleanString(payload.TrOwner)) missing.push("TrOwner");
  if (!cleanString(payload.Client)) missing.push("Client");
  if (!Array.isArray(payload.DeveloperSet) || payload.DeveloperSet.length === 0) missing.push("DeveloperSet");
  if (!payload.WorkbenchReq && !payload.CustomizingReq) missing.push("TransportType");

  return missing;
}

export function normalizeTransportRequestBooleans(payload = {}) {
  return {
    ...payload,
    WorkbenchReq: Boolean(payload.WorkbenchReq),
    CustomizingReq: Boolean(payload.CustomizingReq),
  };
}
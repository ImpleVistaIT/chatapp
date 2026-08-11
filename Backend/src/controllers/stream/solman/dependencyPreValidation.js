import { listSolmanChangeRequestsByDateRange } from "../../../services/systems/solman/charm.service.js";
import { cleanString } from "./solman.shared.js";

function normalizeSystemType(systemId = "", processType = "") {
  const sid = cleanString(systemId).toUpperCase();
  const pt = cleanString(processType).toUpperCase();

  if (pt === "YMHF" || sid.includes("ROW")) return "ROW";
  if (pt === "YMH1" || sid.includes("INDIA")) return "INDIA";
  return "";
}

function normalizeSystemTypeFromRow(row = {}, systemId = "", fallbackProcessType = "") {
  const rowProcessType = cleanString(row?.PROCESS_TYPE || row?.ProcessType || row?.processType);
  const inferredProcessType = rowProcessType || cleanString(fallbackProcessType);
  return normalizeSystemType(systemId, inferredProcessType);
}

function normalizeStatus(value = "") {
  return cleanString(value).toLowerCase().replace(/\s+/g, " ");
}

function getDefaultCrRange(now = new Date(), days = 730) {
  const pad2 = (value) => String(value).padStart(2, "0");
  const formatYmd = (date) => `${date.getFullYear()}${pad2(date.getMonth() + 1)}${pad2(date.getDate())}`;

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const from = new Date(today);
  from.setDate(from.getDate() - (days - 1));

  return {
    fromDate: formatYmd(from),
    toDate: formatYmd(today),
  };
}

function getStatusFromRow(row = {}) {
  return cleanString(row?.STATUS || row?.Status || row?.STATE);
}

function rowMatchesCr(row = {}, crNumber = "") {
  const wanted = cleanString(crNumber);
  const candidates = [
    row?.OBJECT_ID,
    row?.OBJ_ID,
    row?.ChangeRequestId,
    row?.ZchangeRequest,
    row?.CR_NUMBER,
    row?.CR_NO,
    row?.CR,
  ]
    .map((value) => cleanString(value))
    .filter(Boolean);

  return candidates.some((value) => value === wanted);
}

function isRowBlockedStatus(crStatus = "") {
  return ["in development", "under implementation"].includes(normalizeStatus(crStatus));
}

function isIndiaBlockedStatus(crStatus = "") {
  const status = normalizeStatus(crStatus);
  return [
    "in development",
    "ready for test in development",
    "ready for test in develop",
    "ready for test",
  ].includes(status);
}

async function fetchStatusRow({ system, sapAuth, systemId, processType, crNumber }) {
  const sid = cleanString(systemId).toUpperCase();
  const pt = cleanString(processType).toUpperCase();
  const range = getDefaultCrRange();
  const processTypesToTry = pt ? [pt] : ["YMHF", "YMH1"];

  for (const candidateProcessType of processTypesToTry) {
    console.log("[SOLMAN][DEP-PRECHECK] status query", {
      systemId: sid,
      processType: candidateProcessType,
      triggerAll: "X",
      fromDate: range.fromDate,
      toDate: range.toDate,
      crNumber,
    });

    const result = await listSolmanChangeRequestsByDateRange({
      system,
      sapAuth,
      processType: candidateProcessType,
      triggerAll: "X",
      fromDate: range.fromDate,
      toDate: range.toDate,
      top: 200,
      skip: 0,
      orderBy: "CREATED_ON desc",
    });

    const rows = Array.isArray(result?.result?.results) ? result.result.results : [];
    console.log("[SOLMAN][DEP-PRECHECK] status api returned", {
      processType: candidateProcessType,
      rowCount: rows.length,
      sampleKeys: Object.keys(rows[0] || {}),
    });

    const match = rows.find((row) => rowMatchesCr(row, crNumber)) || null;
    if (match) {
      console.log("[SOLMAN][DEP-PRECHECK] matched status row", {
        crNumber,
        processType: candidateProcessType,
        matchedCr: cleanString(match?.OBJECT_ID || match?.OBJ_ID || match?.ChangeRequestId || match?.ZchangeRequest),
        statusValue: getStatusFromRow(match) || "<empty>",
        rowKeys: Object.keys(match || {}),
      });
      return match;
    }
  }

  return null;
}

export async function validateDependencyCheck({ system, sapAuth, systemId, processType, objectId }) {
  const crNumber = cleanString(objectId);
  if (!crNumber) {
    console.log("[SOLMAN][DEP-PRECHECK] skipped: missing CR number", { systemId, processType });
    return { shouldSkipDependency: false };
  }

  console.log("[SOLMAN][DEP-PRECHECK] resolving CR status", {
    systemId: cleanString(systemId).toUpperCase(),
    processType: cleanString(processType).toUpperCase(),
    crNumber,
  });

  const latestRow = (await fetchStatusRow({
    system,
    sapAuth,
    systemId,
    crNumber,
    processType,
  })) || {};
  const statusSource = getStatusFromRow(latestRow);
  const crStatus = normalizeStatus(statusSource);
  const systemType = normalizeSystemTypeFromRow(latestRow, systemId, processType);

  console.log("[SOLMAN][DEP-PRECHECK] status result", {
    crNumber,
    systemType,
    crStatus: crStatus || "<unresolved>",
    statusSource: statusSource || "<empty>",
    latestRowKeys: Object.keys(latestRow || {}),
    shouldSkipDependency:
      (systemType === "ROW" && isRowBlockedStatus(crStatus)) ||
      (systemType === "INDIA" && isIndiaBlockedStatus(crStatus)),
  });

  if (!crStatus) {
    return {
      shouldSkipDependency: false,
      crStatus: "",
      systemType,
    };
  }

  if (systemType === "ROW" && isRowBlockedStatus(crStatus)) {
    console.log("[SOLMAN][DEP-PRECHECK] blocked by ROW rule", { crNumber, crStatus });
    return {
      shouldSkipDependency: true,
      message: "No dependent transports were found for this CR.",
      crStatus,
      systemType,
    };
  }

  if (systemType === "INDIA" && isIndiaBlockedStatus(crStatus)) {
    console.log("[SOLMAN][DEP-PRECHECK] blocked by INDIA rule", { crNumber, crStatus });
    return {
      shouldSkipDependency: true,
      message: "No dependent transports were found for this CR.",
      crStatus,
      systemType,
    };
  }

  return {
    shouldSkipDependency: false,
    crStatus,
    systemType,
  };
}